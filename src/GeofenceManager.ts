import * as ExpoLocation from 'expo-location';
import { database } from './Database';
import { logger } from './Logger';
import { centroid, haversine, pointInPolygon } from './geo';
import { isBackgroundCapable } from './environment';
import type { EventBus } from './EventBus';
import type {
  Geofence,
  GeofenceAction,
  GeofencesChangeEvent,
  Location,
} from './types';

export const GEOFENCE_TASK = 'expo-background-tracking.geofence';

interface GeofenceRuntime {
  inside: boolean;
  enteredAt: number | null;
  dwellFired: boolean;
  active: boolean; // within proximity radius → registered natively
}

/**
 * Unlimited geofencing (circular + polygon) with software proximity
 * management, like transistorsoft: only nearby geofences are registered
 * with the OS; the rest are monitored as the device approaches.
 * In Expo Go, evaluation is fully software-based from the foreground stream.
 */
export class GeofenceManager {
  private runtime = new Map<string, GeofenceRuntime>();
  private proximityRadius = 1000;
  private started = false;

  constructor(private bus: EventBus) {}

  setProximityRadius(metres: number): void {
    this.proximityRadius = metres;
  }

  async add(geofence: Geofence): Promise<boolean> {
    this.validate(geofence);
    await database.upsertGeofence(geofence);
    this.runtime.set(geofence.identifier, {
      inside: false,
      enteredAt: null,
      dwellFired: false,
      active: false,
    });
    if (this.started) await this.refreshNative(null);
    return true;
  }

  async addMany(geofences: Geofence[]): Promise<boolean> {
    for (const g of geofences) {
      this.validate(g);
      await database.upsertGeofence(g);
      this.runtime.set(g.identifier, {
        inside: false,
        enteredAt: null,
        dwellFired: false,
        active: false,
      });
    }
    if (this.started) await this.refreshNative(null);
    return true;
  }

  private validate(g: Geofence): void {
    if (!g.identifier) throw new Error('Geofence requires identifier');
    const circular = g.latitude != null && g.longitude != null && g.radius != null;
    const polygon = !!g.vertices?.length;
    if (!circular && !polygon) {
      throw new Error(
        `Geofence "${g.identifier}" requires latitude/longitude/radius or vertices`
      );
    }
  }

  async remove(identifier: string): Promise<boolean> {
    await database.removeGeofence(identifier);
    this.runtime.delete(identifier);
    if (this.started) await this.refreshNative(null);
    return true;
  }

  async removeAll(identifiers?: string[]): Promise<boolean> {
    await database.removeGeofences(identifiers);
    if (identifiers) identifiers.forEach((id) => this.runtime.delete(id));
    else this.runtime.clear();
    if (this.started) await this.refreshNative(null);
    return true;
  }

  getGeofences(): Promise<Geofence[]> {
    return database.getGeofences();
  }

  getGeofence(identifier: string): Promise<Geofence | null> {
    return database.getGeofence(identifier);
  }

  async exists(identifier: string): Promise<boolean> {
    return (await database.getGeofence(identifier)) != null;
  }

  async start(): Promise<void> {
    this.started = true;
    const geofences = await database.getGeofences();
    for (const g of geofences) {
      if (!this.runtime.has(g.identifier)) {
        this.runtime.set(g.identifier, {
          inside: false,
          enteredAt: null,
          dwellFired: false,
          active: false,
        });
      }
    }
    await this.refreshNative(null);
  }

  async stop(): Promise<void> {
    this.started = false;
    if (isBackgroundCapable()) {
      try {
        const registered = await ExpoLocation.hasStartedGeofencingAsync(GEOFENCE_TASK);
        if (registered) await ExpoLocation.stopGeofencingAsync(GEOFENCE_TASK);
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * Register nearby circular geofences with the OS (dev build only).
   * Polygon geofences are always evaluated in software.
   */
  private async refreshNative(position: { latitude: number; longitude: number } | null): Promise<void> {
    if (!isBackgroundCapable()) return; // Expo Go → software-only
    try {
      const geofences = await database.getGeofences();
      const circular = geofences.filter(
        (g) => g.latitude != null && g.longitude != null && g.radius != null
      );
      let selected = circular;
      const changed: GeofencesChangeEvent = { on: [], off: [] };
      if (position && circular.length > 19) {
        selected = circular
          .map((g) => ({
            g,
            d: haversine(position.latitude, position.longitude, g.latitude!, g.longitude!),
          }))
          .filter(({ g, d }) => d <= this.proximityRadius + (g.radius ?? 0))
          .sort((a, b) => a.d - b.d)
          .slice(0, 19)
          .map(({ g }) => g);
      }
      const selectedIds = new Set(selected.map((g) => g.identifier));
      for (const g of circular) {
        const rt = this.runtime.get(g.identifier);
        if (!rt) continue;
        const nowActive = selectedIds.has(g.identifier);
        if (nowActive && !rt.active) changed.on.push(g);
        if (!nowActive && rt.active) changed.off.push(g.identifier);
        rt.active = nowActive;
      }
      if (changed.on.length || changed.off.length) {
        this.bus.emit('geofenceschange', changed);
      }
      if (selected.length) {
        await ExpoLocation.startGeofencingAsync(
          GEOFENCE_TASK,
          selected.map((g) => ({
            identifier: g.identifier,
            latitude: g.latitude!,
            longitude: g.longitude!,
            radius: g.radius!,
            notifyOnEnter: g.notifyOnEntry !== false,
            notifyOnExit: g.notifyOnExit !== false,
          }))
        );
      } else {
        const registered = await ExpoLocation.hasStartedGeofencingAsync(GEOFENCE_TASK);
        if (registered) await ExpoLocation.stopGeofencingAsync(GEOFENCE_TASK);
      }
    } catch (e) {
      logger.warn(`Native geofencing unavailable: ${String(e)}`);
    }
  }

  /** Software evaluation — called for every location fix. */
  async evaluate(location: Location): Promise<void> {
    const { latitude, longitude } = location.coords;
    const geofences = await database.getGeofences();
    const now = Date.now();

    for (const g of geofences) {
      let rt = this.runtime.get(g.identifier);
      if (!rt) {
        rt = { inside: false, enteredAt: null, dwellFired: false, active: false };
        this.runtime.set(g.identifier, rt);
      }

      let inside: boolean;
      if (g.vertices?.length) {
        inside = pointInPolygon(latitude, longitude, g.vertices);
      } else {
        const d = haversine(latitude, longitude, g.latitude!, g.longitude!);
        inside = d <= (g.radius ?? 200);
      }

      if (inside && !rt.inside) {
        rt.inside = true;
        rt.enteredAt = now;
        rt.dwellFired = false;
        if (g.notifyOnEntry !== false) this.fire(g, 'ENTER', location);
      } else if (!inside && rt.inside) {
        rt.inside = false;
        rt.enteredAt = null;
        rt.dwellFired = false;
        if (g.notifyOnExit !== false) this.fire(g, 'EXIT', location);
      } else if (
        inside &&
        rt.inside &&
        g.notifyOnDwell &&
        !rt.dwellFired &&
        rt.enteredAt != null &&
        now - rt.enteredAt >= (g.loiteringDelay ?? 300_000)
      ) {
        rt.dwellFired = true;
        this.fire(g, 'DWELL', location);
      }
    }

    await this.refreshNative({ latitude, longitude });
  }

  /** Native OS geofence event (from TaskManager, dev build). */
  async onNativeEvent(
    identifier: string,
    action: 'ENTER' | 'EXIT',
    location: Location
  ): Promise<void> {
    const g = await database.getGeofence(identifier);
    if (!g) return;
    const rt = this.runtime.get(identifier);
    if (rt) {
      rt.inside = action === 'ENTER';
      rt.enteredAt = action === 'ENTER' ? Date.now() : null;
    }
    this.fire(g, action, location);
  }

  private fire(g: Geofence, action: GeofenceAction, location: Location): void {
    logger.info(`Geofence ${action}: ${g.identifier}`);
    this.bus.emit('geofence', {
      identifier: g.identifier,
      action,
      location: { ...location, event: 'geofence' as const },
      extras: g.extras,
    });
  }

  /** Useful for polygon geofences: approximate center for native registration. */
  static centerOf(g: Geofence): { latitude: number; longitude: number } {
    if (g.vertices?.length) return centroid(g.vertices);
    return { latitude: g.latitude!, longitude: g.longitude! };
  }
}
