import * as Network from 'expo-network';
import { database } from './Database';
import { logger } from './Logger';
import type { EventBus } from './EventBus';
import type {
  Authorization,
  AuthorizationEvent,
  Config,
  HttpEvent,
  Location,
} from './types';

/**
 * HTTP upload service: autoSync, batchSync, templates, JWT refresh,
 * offline queue with re-sync on reconnect. Pure `fetch` — no Firebase.
 */
export class HttpService {
  private config: Config = {};
  private syncing = false;
  private connectivityTimer: ReturnType<typeof setInterval> | null = null;
  private lastConnected: boolean | null = null;

  constructor(private bus: EventBus) {}

  setConfig(config: Config): void {
    this.config = config;
  }

  startConnectivityMonitoring(intervalMs = 10_000): void {
    this.stopConnectivityMonitoring();
    this.connectivityTimer = setInterval(() => {
      void this.checkConnectivity();
    }, intervalMs);
    void this.checkConnectivity();
  }

  stopConnectivityMonitoring(): void {
    if (this.connectivityTimer) {
      clearInterval(this.connectivityTimer);
      this.connectivityTimer = null;
    }
  }

  private async checkConnectivity(): Promise<void> {
    try {
      const state = await Network.getNetworkStateAsync();
      const connected = !!(state.isConnected && state.isInternetReachable !== false);
      if (this.lastConnected !== null && connected !== this.lastConnected) {
        this.bus.emit('connectivitychange', { connected });
        if (connected && this.config.autoSync !== false) {
          void this.sync();
        }
      }
      this.lastConnected = connected;
    } catch {
      /* ignore */
    }
  }

  /** Called after each persisted location when autoSync is enabled. */
  async autoSync(): Promise<void> {
    if (!this.config.url || this.config.autoSync === false) return;
    const threshold = this.config.autoSyncThreshold ?? 0;
    if (threshold > 0) {
      const count = await database.getCount();
      if (count < threshold) return;
    }
    await this.sync();
  }

  /** Upload all queued locations. Resolves with the uploaded records. */
  async sync(): Promise<Location[]> {
    if (!this.config.url) {
      throw new Error('sync() requires config.url');
    }
    if (this.syncing) return [];
    this.syncing = true;
    try {
      const queue = await database.getLocations({ order: 1 });
      if (!queue.length) return [];

      const batchSync = this.config.batchSync === true;
      const maxBatch = this.config.maxBatchSize && this.config.maxBatchSize > 0
        ? this.config.maxBatchSize
        : Infinity;

      if (batchSync) {
        let i = 0;
        while (i < queue.length) {
          const batch = queue.slice(i, i + (isFinite(maxBatch) ? maxBatch : queue.length));
          const ok = await this.upload(batch);
          if (!ok) break;
          await database.deleteLocations(batch.map((l) => l.uuid));
          i += batch.length;
        }
      } else {
        for (const location of queue) {
          const ok = await this.upload([location]);
          if (!ok) break;
          await database.destroyLocation(location.uuid);
        }
      }
      return queue;
    } finally {
      this.syncing = false;
    }
  }

  private renderTemplate(template: string, location: Location): string {
    return template.replace(/<%=?\s*([\w.]+)\s*%>/g, (_m, path: string) => {
      const flat: Record<string, unknown> = {
        ...location.coords,
        uuid: location.uuid,
        timestamp: location.timestamp,
        odometer: location.odometer,
        is_moving: location.is_moving,
        activity: location.activity?.activity,
        'activity.type': location.activity?.activity,
        'activity.confidence': location.activity?.confidence,
        'battery.level': location.battery?.level,
        'battery.is_charging': location.battery?.is_charging,
      };
      const v = flat[path];
      return v === undefined ? 'null' : JSON.stringify(v);
    });
  }

  private buildBody(locations: Location[]): unknown {
    const template = this.config.locationTemplate;
    const extras = this.config.extras ?? {};
    const records = locations.map((l) => {
      if (template) {
        try {
          return JSON.parse(this.renderTemplate(template, l));
        } catch {
          return { ...l, extras: { ...extras, ...l.extras } };
        }
      }
      return { ...l, extras: { ...extras, ...l.extras } };
    });
    const root = this.config.httpRootProperty ?? 'location';
    const payload = locations.length === 1 && !this.config.batchSync ? records[0] : records;
    if (root === '.') return payload;
    return { [root]: payload, ...(this.config.params ?? {}) };
  }

  private async authHeaders(): Promise<Record<string, string>> {
    const auth = this.config.authorization;
    if (!auth?.accessToken) return {};
    return { Authorization: `Bearer ${auth.accessToken}` };
  }

  private async refreshToken(auth: Authorization): Promise<boolean> {
    if (!auth.refreshUrl || !auth.refreshToken) return false;
    try {
      const payload: Record<string, string> = {};
      const tpl = auth.refreshPayload ?? { refresh_token: '{refreshToken}' };
      for (const [k, v] of Object.entries(tpl)) {
        payload[k] = v.replace('{refreshToken}', auth.refreshToken);
      }
      const res = await fetch(auth.refreshUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(auth.refreshHeaders ?? {}) },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const event: AuthorizationEvent = res.ok
        ? { success: true, status: res.status, response: json }
        : { success: false, status: res.status, error: 'refresh failed' };
      if (res.ok) {
        const token =
          (json.access_token as string) ?? (json.accessToken as string) ?? null;
        const refresh =
          (json.refresh_token as string) ?? (json.refreshToken as string) ?? null;
        if (token) auth.accessToken = token;
        if (refresh) auth.refreshToken = refresh;
      }
      this.bus.emit('authorization', event);
      return res.ok;
    } catch (e) {
      this.bus.emit('authorization', {
        success: false,
        error: String(e),
      } satisfies AuthorizationEvent);
      return false;
    }
  }

  private async upload(locations: Location[], retried = false): Promise<boolean> {
    const url = this.config.url!;
    const method = this.config.method ?? 'POST';
    const timeout = this.config.httpTimeout ?? 60_000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.headers ?? {}),
          ...(await this.authHeaders()),
        },
        body: JSON.stringify(this.buildBody(locations)),
        signal: controller.signal,
      });
      const text = await res.text().catch(() => '');
      const event: HttpEvent = {
        success: res.ok,
        status: res.status,
        responseText: text,
      };
      this.bus.emit('http', event);

      if (res.status === 401 && !retried && this.config.authorization) {
        const refreshed = await this.refreshToken(this.config.authorization);
        if (refreshed) return this.upload(locations, true);
      }
      if (!res.ok) logger.warn(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      return res.ok;
    } catch (e) {
      logger.warn(`HTTP error: ${String(e)}`);
      this.bus.emit('http', {
        success: false,
        status: 0,
        responseText: String(e),
      } satisfies HttpEvent);
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}
