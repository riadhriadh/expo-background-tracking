import { database } from './Database';
import { LogLevel } from './types';

/** SQLite-backed logger, mirrors BackgroundGeolocation.logger. */
export class Logger {
  level: LogLevel = LogLevel.INFO;
  debug = false;

  private write(level: LogLevel, tag: string, message: string): void {
    if (level > this.level) return;
    const line = `[${tag}] ${message}`;
    if (this.debug || level <= LogLevel.WARNING) {
      const fn = level === LogLevel.ERROR ? console.error : console.warn;
      fn(`[expo-background-tracking]${line}`);
    }
    database.insertLog(LogLevel[level], line).catch(() => undefined);
  }

  error(message: string): void {
    this.write(LogLevel.ERROR, 'ERROR', message);
  }
  warn(message: string): void {
    this.write(LogLevel.WARNING, 'WARN', message);
  }
  info(message: string): void {
    this.write(LogLevel.INFO, 'INFO', message);
  }
  debugLog(message: string): void {
    this.write(LogLevel.DEBUG, 'DEBUG', message);
  }
  notice(message: string): void {
    this.write(LogLevel.INFO, 'NOTICE', message);
  }

  async getLog(): Promise<string> {
    const entries = await database.getLogs();
    return entries
      .map((e) => `${e.timestamp} ${e.level} ${e.message}`)
      .join('\n');
  }

  async destroyLog(): Promise<void> {
    await database.destroyLogs();
  }
}

export const logger = new Logger();
