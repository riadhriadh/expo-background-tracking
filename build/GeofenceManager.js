"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeofenceManager = exports.GEOFENCE_TASK = void 0;
const ExpoLocation = __importStar(require("expo-location"));
const Database_1 = require("./Database");
const Logger_1 = require("./Logger");
const geo_1 = require("./geo");
const environment_1 = require("./environment");
exports.GEOFENCE_TASK = 'expo-background-tracking.geofence';
/**
 * Unlimited geofencing (circular + polygon) with software proximity
 * management, like transistorsoft: only nearby geofences are registered
 * with the OS; the rest are monitored as the device approaches.
 * In Expo Go, evaluation is fully software-based from the foreground stream.
 */
class GeofenceManager {
    constructor(bus) {
        this.bus = bus;
        this.runtime = new Map();
        this.proximityRadius = 1000;
        this.started = false;
    }
    setProximityRadius(metres) {
        this.proximityRadius = metres;
    }
    async add(geofence) {
        this.validate(geofence);
        await Database_1.database.upsertGeofence(geofence);
        this.runtime.set(geofence.identifier, {
            inside: false,
            enteredAt: null,
            dwellFired: false,
            active: false,
        });
        if (this.started)
            await this.refreshNative(null);
        return true;
    }
    async addMany(geofences) {
        for (const g of geofences) {
            this.validate(g);
            await Database_1.database.upsertGeofence(g);
            this.runtime.set(g.identifier, {
                inside: false,
                enteredAt: null,
                dwellFired: false,
                active: false,
            });
        }
        if (this.started)
            await this.refreshNative(null);
        return true;
    }
    validate(g) {
        if (!g.identifier)
            throw new Error('Geofence requires identifier');
        const circular = g.latitude != null && g.longitude != null && g.radius != null;
        const polygon = !!g.vertices?.length;
        if (!circular && !polygon) {
            throw new Error(`Geofence "${g.identifier}" requires latitude/longitude/radius or vertices`);
        }
    }
    async remove(identifier) {
        await Database_1.database.removeGeofence(identifier);
        this.runtime.delete(identifier);
        if (this.started)
            await this.refreshNative(null);
        return true;
    }
    async removeAll(identifiers) {
        await Database_1.database.removeGeofences(identifiers);
        if (identifiers)
            identifiers.forEach((id) => this.runtime.delete(id));
        else
            this.runtime.clear();
        if (this.started)
            await this.refreshNative(null);
        return true;
    }
    getGeofences() {
        return Database_1.database.getGeofences();
    }
    getGeofence(identifier) {
        return Database_1.database.getGeofence(identifier);
    }
    async exists(identifier) {
        return (await Database_1.database.getGeofence(identifier)) != null;
    }
    async start() {
        this.started = true;
        const geofences = await Database_1.database.getGeofences();
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
    async stop() {
        this.started = false;
        if ((0, environment_1.isBackgroundCapable)()) {
            try {
                const registered = await ExpoLocation.hasStartedGeofencingAsync(exports.GEOFENCE_TASK);
                if (registered)
                    await ExpoLocation.stopGeofencingAsync(exports.GEOFENCE_TASK);
            }
            catch {
                /* ignore */
            }
        }
    }
    /**
     * Register nearby circular geofences with the OS (dev build only).
     * Polygon geofences are always evaluated in software.
     */
    async refreshNative(position) {
        if (!(0, environment_1.isBackgroundCapable)())
            return; // Expo Go → software-only
        try {
            const geofences = await Database_1.database.getGeofences();
            const circular = geofences.filter((g) => g.latitude != null && g.longitude != null && g.radius != null);
            let selected = circular;
            const changed = { on: [], off: [] };
            if (position && circular.length > 19) {
                selected = circular
                    .map((g) => ({
                    g,
                    d: (0, geo_1.haversine)(position.latitude, position.longitude, g.latitude, g.longitude),
                }))
                    .filter(({ g, d }) => d <= this.proximityRadius + (g.radius ?? 0))
                    .sort((a, b) => a.d - b.d)
                    .slice(0, 19)
                    .map(({ g }) => g);
            }
            const selectedIds = new Set(selected.map((g) => g.identifier));
            for (const g of circular) {
                const rt = this.runtime.get(g.identifier);
                if (!rt)
                    continue;
                const nowActive = selectedIds.has(g.identifier);
                if (nowActive && !rt.active)
                    changed.on.push(g);
                if (!nowActive && rt.active)
                    changed.off.push(g.identifier);
                rt.active = nowActive;
            }
            if (changed.on.length || changed.off.length) {
                this.bus.emit('geofenceschange', changed);
            }
            if (selected.length) {
                await ExpoLocation.startGeofencingAsync(exports.GEOFENCE_TASK, selected.map((g) => ({
                    identifier: g.identifier,
                    latitude: g.latitude,
                    longitude: g.longitude,
                    radius: g.radius,
                    notifyOnEnter: g.notifyOnEntry !== false,
                    notifyOnExit: g.notifyOnExit !== false,
                })));
            }
            else {
                const registered = await ExpoLocation.hasStartedGeofencingAsync(exports.GEOFENCE_TASK);
                if (registered)
                    await ExpoLocation.stopGeofencingAsync(exports.GEOFENCE_TASK);
            }
        }
        catch (e) {
            Logger_1.logger.warn(`Native geofencing unavailable: ${String(e)}`);
        }
    }
    /** Software evaluation — called for every location fix. */
    async evaluate(location) {
        const { latitude, longitude } = location.coords;
        const geofences = await Database_1.database.getGeofences();
        const now = Date.now();
        for (const g of geofences) {
            let rt = this.runtime.get(g.identifier);
            if (!rt) {
                rt = { inside: false, enteredAt: null, dwellFired: false, active: false };
                this.runtime.set(g.identifier, rt);
            }
            let inside;
            if (g.vertices?.length) {
                inside = (0, geo_1.pointInPolygon)(latitude, longitude, g.vertices);
            }
            else {
                const d = (0, geo_1.haversine)(latitude, longitude, g.latitude, g.longitude);
                inside = d <= (g.radius ?? 200);
            }
            if (inside && !rt.inside) {
                rt.inside = true;
                rt.enteredAt = now;
                rt.dwellFired = false;
                if (g.notifyOnEntry !== false)
                    this.fire(g, 'ENTER', location);
            }
            else if (!inside && rt.inside) {
                rt.inside = false;
                rt.enteredAt = null;
                rt.dwellFired = false;
                if (g.notifyOnExit !== false)
                    this.fire(g, 'EXIT', location);
            }
            else if (inside &&
                rt.inside &&
                g.notifyOnDwell &&
                !rt.dwellFired &&
                rt.enteredAt != null &&
                now - rt.enteredAt >= (g.loiteringDelay ?? 300000)) {
                rt.dwellFired = true;
                this.fire(g, 'DWELL', location);
            }
        }
        await this.refreshNative({ latitude, longitude });
    }
    /** Native OS geofence event (from TaskManager, dev build). */
    async onNativeEvent(identifier, action, location) {
        const g = await Database_1.database.getGeofence(identifier);
        if (!g)
            return;
        const rt = this.runtime.get(identifier);
        if (rt) {
            rt.inside = action === 'ENTER';
            rt.enteredAt = action === 'ENTER' ? Date.now() : null;
        }
        this.fire(g, action, location);
    }
    fire(g, action, location) {
        Logger_1.logger.info(`Geofence ${action}: ${g.identifier}`);
        this.bus.emit('geofence', {
            identifier: g.identifier,
            action,
            location: { ...location, event: 'geofence' },
            extras: g.extras,
        });
    }
    /** Useful for polygon geofences: approximate center for native registration. */
    static centerOf(g) {
        if (g.vertices?.length)
            return (0, geo_1.centroid)(g.vertices);
        return { latitude: g.latitude, longitude: g.longitude };
    }
}
exports.GeofenceManager = GeofenceManager;
