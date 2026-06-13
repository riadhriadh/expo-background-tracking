import { LogLevel } from './types';
/** SQLite-backed logger, mirrors BackgroundGeolocation.logger. */
export declare class Logger {
    level: LogLevel;
    debug: boolean;
    private write;
    error(message: string): void;
    warn(message: string): void;
    info(message: string): void;
    debugLog(message: string): void;
    notice(message: string): void;
    getLog(): Promise<string>;
    destroyLog(): Promise<void>;
}
export declare const logger: Logger;
