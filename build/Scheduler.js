"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Scheduler = void 0;
const Logger_1 = require("./Logger");
/**
 * Weekly schedule engine — "1-5 09:00-17:00" style entries
 * (same syntax as transistorsoft). JS timer-based: evaluated every
 * 30 s while the app runs; state re-evaluated on resume.
 */
class Scheduler {
    constructor(onScheduleChange) {
        this.onScheduleChange = onScheduleChange;
        this.timer = null;
        this.schedules = [];
        this.lastShouldBeEnabled = null;
    }
    get enabled() {
        return this.timer != null;
    }
    setSchedule(items) {
        this.schedules = items
            .map((s) => this.parse(s))
            .filter((s) => s != null);
    }
    start() {
        if (this.timer)
            return;
        if (!this.schedules.length) {
            Logger_1.logger.warn('startSchedule: no schedule configured');
            return;
        }
        this.timer = setInterval(() => this.evaluate(), 30000);
        this.evaluate();
        Logger_1.logger.info('Schedule started');
    }
    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.lastShouldBeEnabled = null;
        Logger_1.logger.info('Schedule stopped');
    }
    evaluate() {
        const now = new Date();
        const isoDay = now.getDay() === 0 ? 7 : now.getDay();
        const minutes = now.getHours() * 60 + now.getMinutes();
        const shouldBeEnabled = this.schedules.some((s) => s.days.has(isoDay) && minutes >= s.startMinutes && minutes < s.endMinutes);
        if (shouldBeEnabled !== this.lastShouldBeEnabled) {
            this.lastShouldBeEnabled = shouldBeEnabled;
            this.onScheduleChange(shouldBeEnabled);
        }
    }
    parse(item) {
        // "1-5 09:00-17:00" | "7 10:00-12:00" | "1,3,5 08:30-18:00"
        const m = item.trim().match(/^([\d,\-]+)\s+(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);
        if (!m) {
            Logger_1.logger.warn(`Invalid schedule item: "${item}"`);
            return null;
        }
        const days = new Set();
        for (const part of m[1].split(',')) {
            const range = part.split('-').map(Number);
            if (range.length === 2) {
                for (let d = range[0]; d <= range[1]; d++)
                    days.add(d);
            }
            else {
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
exports.Scheduler = Scheduler;
