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
exports.database = exports.Database = void 0;
const SQLite = __importStar(require("expo-sqlite"));
const DB_NAME = 'expo_background_tracking.db';
/**
 * SQLite persistence layer (locations queue, geofences, key/value state, logs).
 * Mirrors the embedded database of transistorsoft's SDK.
 */
class Database {
    constructor() {
        this.db = null;
        this.opening = null;
    }
    async open() {
        if (this.db)
            return this.db;
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
    async insertLocation(location) {
        const db = await this.open();
        await db.runAsync('INSERT OR REPLACE INTO locations (uuid, timestamp, data, synced) VALUES (?, ?, ?, 0)', location.uuid, Date.parse(location.timestamp), JSON.stringify(location));
    }
    async getLocations(query) {
        const db = await this.open();
        const where = [];
        const args = [];
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
        const sql = `SELECT data FROM locations ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY timestamp ${order}${limit}`;
        const rows = await db.getAllAsync(sql, ...args);
        return rows.map((r) => JSON.parse(r.data));
    }
    async getCount() {
        const db = await this.open();
        const row = await db.getFirstAsync('SELECT COUNT(*) as c FROM locations');
        return row?.c ?? 0;
    }
    async destroyLocations() {
        const db = await this.open();
        await db.runAsync('DELETE FROM locations');
    }
    async destroyLocation(uuid) {
        const db = await this.open();
        await db.runAsync('DELETE FROM locations WHERE uuid = ?', uuid);
    }
    async deleteLocations(uuids) {
        if (!uuids.length)
            return;
        const db = await this.open();
        const placeholders = uuids.map(() => '?').join(',');
        await db.runAsync(`DELETE FROM locations WHERE uuid IN (${placeholders})`, ...uuids);
    }
    /** Purge by retention policy. */
    async prune(maxDays, maxRecords) {
        const db = await this.open();
        if (maxDays > 0) {
            const cutoff = Date.now() - maxDays * 86400000;
            await db.runAsync('DELETE FROM locations WHERE timestamp < ?', cutoff);
        }
        if (maxRecords > 0) {
            await db.runAsync(`DELETE FROM locations WHERE uuid NOT IN (
           SELECT uuid FROM locations ORDER BY timestamp DESC LIMIT ?
         )`, maxRecords);
        }
    }
    // --- geofences ----------------------------------------------------------
    async upsertGeofence(geofence) {
        const db = await this.open();
        await db.runAsync('INSERT OR REPLACE INTO geofences (identifier, data) VALUES (?, ?)', geofence.identifier, JSON.stringify(geofence));
    }
    async getGeofences() {
        const db = await this.open();
        const rows = await db.getAllAsync('SELECT data FROM geofences');
        return rows.map((r) => JSON.parse(r.data));
    }
    async getGeofence(identifier) {
        const db = await this.open();
        const row = await db.getFirstAsync('SELECT data FROM geofences WHERE identifier = ?', identifier);
        return row ? JSON.parse(row.data) : null;
    }
    async removeGeofence(identifier) {
        const db = await this.open();
        await db.runAsync('DELETE FROM geofences WHERE identifier = ?', identifier);
    }
    async removeGeofences(identifiers) {
        const db = await this.open();
        if (!identifiers) {
            await db.runAsync('DELETE FROM geofences');
            return;
        }
        if (!identifiers.length)
            return;
        const placeholders = identifiers.map(() => '?').join(',');
        await db.runAsync(`DELETE FROM geofences WHERE identifier IN (${placeholders})`, ...identifiers);
    }
    // --- key/value (state, odometer, config) --------------------------------
    async setKV(key, value) {
        const db = await this.open();
        await db.runAsync('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)', key, JSON.stringify(value));
    }
    async getKV(key) {
        const db = await this.open();
        const row = await db.getFirstAsync('SELECT value FROM kv WHERE key = ?', key);
        return row ? JSON.parse(row.value) : null;
    }
    // --- logs ----------------------------------------------------------------
    async insertLog(level, message) {
        const db = await this.open();
        await db.runAsync('INSERT INTO logs (timestamp, level, message) VALUES (?, ?, ?)', Date.now(), level, message);
    }
    async getLogs(limit = 5000) {
        const db = await this.open();
        const rows = await db.getAllAsync('SELECT timestamp, level, message FROM logs ORDER BY id ASC LIMIT ?', limit);
        return rows.map((r) => ({
            timestamp: new Date(r.timestamp).toISOString(),
            level: r.level,
            message: r.message,
        }));
    }
    async destroyLogs() {
        const db = await this.open();
        await db.runAsync('DELETE FROM logs');
    }
    async pruneLogs(maxDays) {
        if (maxDays <= 0)
            return;
        const db = await this.open();
        await db.runAsync('DELETE FROM logs WHERE timestamp < ?', Date.now() - maxDays * 86400000);
    }
}
exports.Database = Database;
exports.database = new Database();
