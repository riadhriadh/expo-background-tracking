import type { Geofence, Location, LogEntry, SQLQuery } from './types';
/**
 * SQLite persistence layer (locations queue, geofences, key/value state, logs).
 * Mirrors the embedded database of transistorsoft's SDK.
 */
export declare class Database {
    private db;
    private opening;
    private open;
    insertLocation(location: Location): Promise<void>;
    getLocations(query?: SQLQuery): Promise<Location[]>;
    getCount(): Promise<number>;
    destroyLocations(): Promise<void>;
    destroyLocation(uuid: string): Promise<void>;
    deleteLocations(uuids: string[]): Promise<void>;
    /** Purge by retention policy. */
    prune(maxDays: number, maxRecords: number): Promise<void>;
    upsertGeofence(geofence: Geofence): Promise<void>;
    getGeofences(): Promise<Geofence[]>;
    getGeofence(identifier: string): Promise<Geofence | null>;
    removeGeofence(identifier: string): Promise<void>;
    removeGeofences(identifiers?: string[]): Promise<void>;
    setKV(key: string, value: unknown): Promise<void>;
    getKV<T>(key: string): Promise<T | null>;
    insertLog(level: string, message: string): Promise<void>;
    getLogs(limit?: number): Promise<LogEntry[]>;
    destroyLogs(): Promise<void>;
    pruneLogs(maxDays: number): Promise<void>;
}
export declare const database: Database;
