"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = exports.Logger = void 0;
const Database_1 = require("./Database");
const types_1 = require("./types");
/** SQLite-backed logger, mirrors BackgroundGeolocation.logger. */
class Logger {
    constructor() {
        this.level = types_1.LogLevel.INFO;
        this.debug = false;
    }
    write(level, tag, message) {
        if (level > this.level)
            return;
        const line = `[${tag}] ${message}`;
        if (this.debug || level <= types_1.LogLevel.WARNING) {
            const fn = level === types_1.LogLevel.ERROR
                ? console.error
                : level === types_1.LogLevel.WARNING
                    ? console.warn
                    : console.log;
            fn(`[expo-background-tracking]${line}`);
        }
        Database_1.database.insertLog(types_1.LogLevel[level], line).catch(() => undefined);
    }
    error(message) {
        this.write(types_1.LogLevel.ERROR, 'ERROR', message);
    }
    warn(message) {
        this.write(types_1.LogLevel.WARNING, 'WARN', message);
    }
    info(message) {
        this.write(types_1.LogLevel.INFO, 'INFO', message);
    }
    debugLog(message) {
        this.write(types_1.LogLevel.DEBUG, 'DEBUG', message);
    }
    notice(message) {
        this.write(types_1.LogLevel.INFO, 'NOTICE', message);
    }
    async getLog() {
        const entries = await Database_1.database.getLogs();
        return entries
            .map((e) => `${e.timestamp} ${e.level} ${e.message}`)
            .join('\n');
    }
    async destroyLog() {
        await Database_1.database.destroyLogs();
    }
}
exports.Logger = Logger;
exports.logger = new Logger();
