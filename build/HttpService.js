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
exports.HttpService = void 0;
const Network = __importStar(require("expo-network"));
const Database_1 = require("./Database");
const Logger_1 = require("./Logger");
/**
 * HTTP upload service: autoSync, batchSync, templates, JWT refresh,
 * offline queue with re-sync on reconnect. Pure `fetch` — no Firebase.
 */
class HttpService {
    constructor(bus) {
        this.bus = bus;
        this.config = {};
        this.syncing = false;
        this.connectivityTimer = null;
        this.lastConnected = null;
    }
    setConfig(config) {
        this.config = config;
    }
    startConnectivityMonitoring(intervalMs = 10000) {
        this.stopConnectivityMonitoring();
        this.connectivityTimer = setInterval(() => {
            void this.checkConnectivity();
        }, intervalMs);
        void this.checkConnectivity();
    }
    stopConnectivityMonitoring() {
        if (this.connectivityTimer) {
            clearInterval(this.connectivityTimer);
            this.connectivityTimer = null;
        }
    }
    async checkConnectivity() {
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
        }
        catch {
            /* ignore */
        }
    }
    /** Called after each persisted location when autoSync is enabled. */
    async autoSync() {
        if (!this.config.url || this.config.autoSync === false)
            return;
        const threshold = this.config.autoSyncThreshold ?? 0;
        if (threshold > 0) {
            const count = await Database_1.database.getCount();
            if (count < threshold)
                return;
        }
        await this.sync();
    }
    /** Upload all queued locations. Resolves with the uploaded records. */
    async sync() {
        if (!this.config.url) {
            throw new Error('sync() requires config.url');
        }
        if (this.syncing)
            return [];
        this.syncing = true;
        try {
            const queue = await Database_1.database.getLocations({ order: 1 });
            if (!queue.length)
                return [];
            const batchSync = this.config.batchSync === true;
            const maxBatch = this.config.maxBatchSize && this.config.maxBatchSize > 0
                ? this.config.maxBatchSize
                : Infinity;
            if (batchSync) {
                let i = 0;
                while (i < queue.length) {
                    const batch = queue.slice(i, i + (isFinite(maxBatch) ? maxBatch : queue.length));
                    const ok = await this.upload(batch);
                    if (!ok)
                        break;
                    await Database_1.database.deleteLocations(batch.map((l) => l.uuid));
                    i += batch.length;
                }
            }
            else {
                for (const location of queue) {
                    const ok = await this.upload([location]);
                    if (!ok)
                        break;
                    await Database_1.database.destroyLocation(location.uuid);
                }
            }
            return queue;
        }
        finally {
            this.syncing = false;
        }
    }
    renderTemplate(template, location) {
        return template.replace(/<%=?\s*([\w.]+)\s*%>/g, (_m, path) => {
            const flat = {
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
    buildBody(locations) {
        const template = this.config.locationTemplate;
        const extras = this.config.extras ?? {};
        const records = locations.map((l) => {
            if (template) {
                try {
                    return JSON.parse(this.renderTemplate(template, l));
                }
                catch {
                    return { ...l, extras: { ...extras, ...l.extras } };
                }
            }
            return { ...l, extras: { ...extras, ...l.extras } };
        });
        const root = this.config.httpRootProperty ?? 'location';
        const payload = locations.length === 1 && !this.config.batchSync ? records[0] : records;
        if (root === '.')
            return payload;
        return { [root]: payload, ...(this.config.params ?? {}) };
    }
    async authHeaders() {
        const auth = this.config.authorization;
        if (!auth?.accessToken)
            return {};
        return { Authorization: `Bearer ${auth.accessToken}` };
    }
    async refreshToken(auth) {
        if (!auth.refreshUrl || !auth.refreshToken)
            return false;
        try {
            const payload = {};
            const tpl = auth.refreshPayload ?? { refresh_token: '{refreshToken}' };
            for (const [k, v] of Object.entries(tpl)) {
                payload[k] = v.replace('{refreshToken}', auth.refreshToken);
            }
            const res = await fetch(auth.refreshUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(auth.refreshHeaders ?? {}) },
                body: JSON.stringify(payload),
            });
            const json = (await res.json().catch(() => ({})));
            const event = res.ok
                ? { success: true, status: res.status, response: json }
                : { success: false, status: res.status, error: 'refresh failed' };
            if (res.ok) {
                const token = json.access_token ?? json.accessToken ?? null;
                const refresh = json.refresh_token ?? json.refreshToken ?? null;
                if (token)
                    auth.accessToken = token;
                if (refresh)
                    auth.refreshToken = refresh;
            }
            this.bus.emit('authorization', event);
            return res.ok;
        }
        catch (e) {
            this.bus.emit('authorization', {
                success: false,
                error: String(e),
            });
            return false;
        }
    }
    async upload(locations, retried = false) {
        const url = this.config.url;
        const method = this.config.method ?? 'POST';
        const timeout = this.config.httpTimeout ?? 60000;
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
            const event = {
                success: res.ok,
                status: res.status,
                responseText: text,
            };
            this.bus.emit('http', event);
            if (res.status === 401 && !retried && this.config.authorization) {
                const refreshed = await this.refreshToken(this.config.authorization);
                if (refreshed)
                    return this.upload(locations, true);
            }
            if (!res.ok)
                Logger_1.logger.warn(`HTTP ${res.status}: ${text.slice(0, 200)}`);
            return res.ok;
        }
        catch (e) {
            Logger_1.logger.warn(`HTTP error: ${String(e)}`);
            this.bus.emit('http', {
                success: false,
                status: 0,
                responseText: String(e),
            });
            return false;
        }
        finally {
            clearTimeout(timer);
        }
    }
}
exports.HttpService = HttpService;
