import type { EventBus } from './EventBus';
import type { Geofence, Location } from './types';
export declare const GEOFENCE_TASK = "expo-background-tracking.geofence";
/**
 * Unlimited geofencing (circular + polygon) with software proximity
 * management, like transistorsoft: only nearby geofences are registered
 * with the OS; the rest are monitored as the device approaches.
 * In Expo Go, evaluation is fully software-based from the foreground stream.
 */
export declare class GeofenceManager {
    private bus;
    private runtime;
    private proximityRadius;
    private started;
    constructor(bus: EventBus);
    setProximityRadius(metres: number): void;
    add(geofence: Geofence): Promise<boolean>;
    addMany(geofences: Geofence[]): Promise<boolean>;
    private validate;
    remove(identifier: string): Promise<boolean>;
    removeAll(identifiers?: string[]): Promise<boolean>;
    getGeofences(): Promise<Geofence[]>;
    getGeofence(identifier: string): Promise<Geofence | null>;
    exists(identifier: string): Promise<boolean>;
    start(): Promise<void>;
    stop(): Promise<void>;
    /**
     * Register nearby circular geofences with the OS (dev build only).
     * Polygon geofences are always evaluated in software.
     */
    private refreshNative;
    /** Software evaluation — called for every location fix. */
    evaluate(location: Location): Promise<void>;
    /** Native OS geofence event (from TaskManager, dev build). */
    onNativeEvent(identifier: string, action: 'ENTER' | 'EXIT', location: Location): Promise<void>;
    private fire;
    /** Useful for polygon geofences: approximate center for native registration. */
    static centerOf(g: Geofence): {
        latitude: number;
        longitude: number;
    };
}
