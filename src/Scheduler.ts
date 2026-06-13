import { logger } from './Logger';
import type { ScheduleItem } from './types';

interface ParsedSchedule {
  days: Set<number>; // 1=Mon … 7=Sun
  startMinutes: number;
  endMinutes: number;
}

/**
 * Weekly schedule engine — "1-5 09:00-17:00" style entries
 * (same syntax as transistorsoft). JS timer-based: evaluated every
 * 30 s while the app runs; state re-evaluated on resume.
 */
export class Scheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private schedules: ParsedSchedule[] = [];
  private lastShouldBeEnabled: boolean | null = null;

  constructor(
    private onScheduleChange: (enabled: boolean) => void
  ) {}

  get enabled(): boolean {
    return this.timer != null;
  }

  setSchedule(items: ScheduleItem[]): void {
    this.schedules = items
      .map((s) => this.parse(s))
      .filter((s): s is ParsedSchedule => s != null);
  }

  start(): void {
    if (this.timer) return;
    if (!this.schedules.length) {
      logger.warn('startSchedule: no schedule configured');
      return;
    }
    this.timer = setInterval(() => this.evaluate(), 30_000);
    this.evaluate();
    logger.info('Schedule started');
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.lastShouldBeEnabled = null;
    logger.info('Schedule stopped');
  }

  private evaluate(): void {
    const now = new Date();
    const isoDay = now.getDay() === 0 ? 7 : now.getDay();
    const minutes = now.getHours() * 60 + now.getMinutes();
    const shouldBeEnabled = this.schedules.some(
      (s) =>
        s.days.has(isoDay) && minutes >= s.startMinutes && minutes < s.endMinutes
    );
    if (shouldBeEnabled !== this.lastShouldBeEnabled) {
      this.lastShouldBeEnabled = shouldBeEnabled;
      this.onScheduleChange(shouldBeEnabled);
    }
  }

  private parse(item: string): ParsedSchedule | null {
    // "1-5 09:00-17:00" | "7 10:00-12:00" | "1,3,5 08:30-18:00"
    const m = item.trim().match(/^([\d,\-]+)\s+(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);
    if (!m) {
      logger.warn(`Invalid schedule item: "${item}"`);
      return null;
    }
    const days = new Set<number>();
    for (const part of m[1].split(',')) {
      const range = part.split('-').map(Number);
      if (range.length === 2) {
        for (let d = range[0]; d <= range[1]; d++) days.add(d);
      } else {
        days.add(range[0]);
      }
    }
    return {
      days,
      startMinutes: Number(m[2]) * 60 + Number(m[3]),
      endMinutes: Number(m[4]) * 60 + Number(m[5]),
    };
  }
}
