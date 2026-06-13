import * as SQLite from 'expo-sqlite';
import type { Geofence, Location, LogEntry, SQLQuery } from './types';

const DB_NAME = 'expo_background_tracking.db';

/**
 * SQLite persistence layer (locations queue, geofences, key/value state, logs).
 * Mirrors the embedded database of transistorsoft's SDK.
 */
export class Database {
  private db: SQLite.SQLiteDatabase | null = null;
  private opening: Promise<SQLite.SQLiteDatabase> | null = null;

  private async open(): Promise<SQLite.SQLiteDatabase> {
    if (this.db) return this.db;
    if (!this.opening) {
      this.opening = (async () => {
        const db = await SQLite.openDatabaseAsync(DB_NAME);
        await db.execAsync(`
          PRAGMA journal_mode = WAL;
          CREATE TABLE IF NOT EXISTS locations (
            uuid TEXT PRIMARY KEY,
            timestamp INTEGER NOT NULL,
            data TEXT NOT NULL,
            synced INTEGER DEFAULT 0
          );
          CREATE INDEX IF NOT EXISTS idx_locations_ts ON locations (timestamp);
          CREATE TABLE IF NOT EXISTS geofences (
            identifier TEXT PRIMARY KEY,
            data TEXT NOT NULL
          );
          CREATE TABLE IF NOT EXISTS kv (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
          );
          CREATE TABLE IF NOT EXISTS logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp INTEGER NOT NULL,
            level TEXT NOT NULL,
            message TEXT NOT NULL
          );
        `);
        this.db = db;
        return db;
      })();
    }
    return this.opening;
  }

  // --- locations ---------------------------------------------------------

  async insertLocation(location: Location): Promise<void> {
    const db = await this.open();
    await db.runAsync(
      'INSERT OR REPLACE INTO locations (uuid, timestamp, data, synced) VALUES (?, ?, ?, 0)',
      location.uuid,
      Date.parse(location.timestamp),
      JSON.stringify(location)
    );
  }

  async getLocations(query?: SQLQuery): Promise<Location[]> {
    const db = await this.open();
    const where: string[] = [];
    const args: number[] = [];
    if (query?.start != null) {
      where.push('timestamp >= ?');
      args.push(query.start);
    }
    if (query?.end != null) {
      where.push('timestamp <= ?');
      args.push(query.end);
    }
    const order = query?.order === -1 ? 'DESC' : 'ASC';
    const limit = query?.limit ? ` LIMIT ${Math.floor(query.limit)}` : '';
    const sql = `SELECT data FROM locations ${
      where.length ? 'WHERE ' + where.join(' AND ') : ''
    } ORDER BY timestamp ${order}${limit}`;
    const rows = await db.getAllAsync<{ data: string }>(sql, ...args);
    return rows.map((r) => JSON.parse(r.data) as Location);
  }

  async getCount(): Promise<number> {
    const db = await this.open();
    const row = await db.getFirstAsync<{ c: number }>(
      'SELECT COUNT(*) as c FROM locations'
    );
    return row?.c ?? 0;
  }

  async destroyLocations(): Promise<void> {
    const db = await this.open();
    await db.runAsync('DELETE FROM locations');
  }

  async destroyLocation(uuid: string): Promise<void> {
    const db = await this.open();
    await db.runAsync('DELETE FROM locations WHERE uuid = ?', uuid);
  }

  async deleteLocations(uuids: string[]): Promise<void> {
    if (!uuids.length) return;
    const db = await this.open();
    const placeholders = uuids.map(() => '?').join(',');
    await db.runAsync(
      `DELETE FROM locations WHERE uuid IN (${placeholders})`,
      ...uuids
    );
  }

  /** Purge by retention policy. */
  async prune(maxDays: number, maxRecords: number): Promise<void> {
    const db = await this.open();
    if (maxDays > 0) {
      const cutoff = Date.now() - maxDays * 86_400_000;
      await db.runAsync('DELETE FROM locations WHERE timestamp < ?', cutoff);
    }
    if (maxRecords > 0) {
      await db.runAsync(
        `DELETE FROM locations WHERE uuid NOT IN (
           SELECT uuid FROM locations ORDER BY timestamp DESC LIMIT ?
         )`,
        maxRecords
      );
    }
  }

  // --- geofences ----------------------------------------------------------

  async upsertGeofence(geofence: Geofence): Promise<void> {
    const db = await this.open();
    await db.runAsync(
      'INSERT OR REPLACE INTO geofences (identifier, data) VALUES (?, ?)',
      geofence.identifier,
      JSON.stringify(geofence)
    );
  }

  async getGeofences(): Promise<Geofence[]> {
    const db = await this.open();
    const rows = await db.getAllAsync<{ data: string }>(
      'SELECT data FROM geofences'
    );
    return rows.map((r) => JSON.parse(r.data) as Geofence);
  }

  async getGeofence(identifier: string): Promise<Geofence | null> {
    const db = await this.open();
    const row = await db.getFirstAsync<{ data: string }>(
      'SELECT data FROM geofences WHERE identifier = ?',
      identifier
    );
    return row ? (JSON.parse(row.data) as Geofence) : null;
  }

  async removeGeofence(identifier: string): Promise<void> {
    const db = await this.open();
    await db.runAsync('DELETE FROM geofences WHERE identifier = ?', identifier);
  }

  async removeGeofences(identifiers?: string[]): Promise<void> {
    const db = await this.open();
    if (!identifiers) {
      await db.runAsync('DELETE FROM geofences');
      return;
    }
    if (!identifiers.length) return;
    const placeholders = identifiers.map(() => '?').join(',');
    await db.runAsync(
      `DELETE FROM geofences WHERE identifier IN (${placeholders})`,
      ...identifiers
    );
  }

  // --- key/value (state, odometer, config) --------------------------------

  async setKV(key: string, value: unknown): Promise<void> {
    const db = await this.open();
    await db.runAsync(
      'INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)',
      key,
      JSON.stringify(value)
    );
  }

  async getKV<T>(key: string): Promise<T | null> {
    const db = await this.open();
    const row = await db.getFirstAsync<{ value: string }>(
      'SELECT value FROM kv WHERE key = ?',
      key
    );
    return row ? (JSON.parse(row.value) as T) : null;
  }

  // --- logs ----------------------------------------------------------------

  async insertLog(level: string, message: string): Promise<void> {
    const db = await this.open();
    await db.runAsync(
      'INSERT INTO logs (timestamp, level, message) VALUES (?, ?, ?)',
      Date.now(),
      level,
      message
    );
  }

  async getLogs(limit = 5000): Promise<LogEntry[]> {
    const db = await this.open();
    const rows = await db.getAllAsync<{
      timestamp: number;
      level: string;
      message: string;
    }>('SELECT timestamp, level, message FROM logs ORDER BY id ASC LIMIT ?', limit);
    return rows.map((r) => ({
      timestamp: new Date(r.timestamp).toISOString(),
      level: r.level,
      message: r.message,
    }));
  }

  async destroyLogs(): Promise<void> {
    const db = await this.open();
    await db.runAsync('DELETE FROM logs');
  }

  async pruneLogs(maxDays: number): Promise<void> {
    if (maxDays <= 0) return;
    const db = await this.open();
    await db.runAsync(
      'DELETE FROM logs WHERE timestamp < ?',
      Date.now() - maxDays * 86_400_000
    );
  }
}

export const database = new Database();
