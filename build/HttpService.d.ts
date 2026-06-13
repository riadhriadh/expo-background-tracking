import type { EventBus } from './EventBus';
import type { Config, Location } from './types';
/**
 * HTTP upload service: autoSync, batchSync, templates, JWT refresh,
 * offline queue with re-sync on reconnect. Pure `fetch` — no Firebase.
 */
export declare class HttpService {
    private bus;
    private config;
    private syncing;
    private connectivityTimer;
    private lastConnected;
    constructor(bus: EventBus);
    setConfig(config: Config): void;
    startConnectivityMonitoring(intervalMs?: number): void;
    stopConnectivityMonitoring(): void;
    private checkConnectivity;
    /** Called after each persisted location when autoSync is enabled. */
    autoSync(): Promise<void>;
    /** Upload all queued locations. Resolves with the uploaded records. */
    sync(): Promise<Location[]>;
    private renderTemplate;
    private buildBody;
    private authHeaders;
    private refreshToken;
    private upload;
}
