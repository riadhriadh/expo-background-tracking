"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Scheduler_1 = require("../Scheduler");
// Silence logger output during tests
jest.mock('../Logger', () => ({
    logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
/** Helper: build a Date for a given ISO weekday (1=Mon…7=Sun) and HH:MM. */
function makeDate(isoDay, hours, minutes) {
    // JS day 0=Sun…6=Sat ; ISO 1=Mon…7=Sun
    const jsDay = isoDay === 7 ? 0 : isoDay;
    const d = new Date(2026, 0, 1); // Thursday 2026-01-01 → jsDay=4
    // find the next date that matches jsDay
    const diff = (jsDay - d.getDay() + 7) % 7;
    d.setDate(d.getDate() + diff);
    d.setHours(hours, minutes, 0, 0);
    return d;
}
describe('Scheduler', () => {
    let onChange;
    let scheduler;
    beforeEach(() => {
        jest.useFakeTimers();
        onChange = jest.fn();
        scheduler = new Scheduler_1.Scheduler(onChange);
    });
    afterEach(() => {
        scheduler.stop();
        jest.useRealTimers();
    });
    describe('schedule parsing & evaluation', () => {
        it('fires enabled=true when inside a window', () => {
            // Monday 10:00 — inside "1-5 09:00-17:00"
            jest.setSystemTime(makeDate(1, 10, 0));
            scheduler.setSchedule(['1-5 09:00-17:00']);
            scheduler.start();
            expect(onChange).toHaveBeenCalledWith(true);
        });
        it('fires enabled=false when outside the time window', () => {
            // Monday 08:00 — before "1-5 09:00-17:00"
            jest.setSystemTime(makeDate(1, 8, 0));
            scheduler.setSchedule(['1-5 09:00-17:00']);
            scheduler.start();
            expect(onChange).toHaveBeenCalledWith(false);
        });
        it('fires enabled=false on a weekend for a weekday-only schedule', () => {
            // Sunday 12:00 — outside "1-5 09:00-17:00"
            jest.setSystemTime(makeDate(7, 12, 0));
            scheduler.setSchedule(['1-5 09:00-17:00']);
            scheduler.start();
            expect(onChange).toHaveBeenCalledWith(false);
        });
        it('fires enabled=true for comma-separated days ("1,3,5")', () => {
            // Wednesday (day 3) at 10:00
            jest.setSystemTime(makeDate(3, 10, 0));
            scheduler.setSchedule(['1,3,5 09:00-11:00']);
            scheduler.start();
            expect(onChange).toHaveBeenCalledWith(true);
        });
        it('handles Saturday schedule ("6 10:00-14:00")', () => {
            jest.setSystemTime(makeDate(6, 11, 0));
            scheduler.setSchedule(['6 10:00-14:00']);
            scheduler.start();
            expect(onChange).toHaveBeenCalledWith(true);
        });
    });
    describe('state transitions', () => {
        it('does not re-fire if state does not change between ticks', () => {
            jest.setSystemTime(makeDate(1, 10, 0));
            scheduler.setSchedule(['1-5 09:00-17:00']);
            scheduler.start();
            jest.advanceTimersByTime(30000); // one tick
            jest.advanceTimersByTime(30000); // second tick
            // onChange should only fire once (on start) since nothing changed
            expect(onChange).toHaveBeenCalledTimes(1);
        });
        it('transitions enabled→disabled when time window closes', () => {
            jest.setSystemTime(makeDate(1, 16, 59));
            scheduler.setSchedule(['1-5 09:00-17:00']);
            scheduler.start();
            expect(onChange).toHaveBeenLastCalledWith(true);
            // Advance into 17:00 — outside window
            jest.setSystemTime(makeDate(1, 17, 1));
            jest.advanceTimersByTime(30000);
            expect(onChange).toHaveBeenLastCalledWith(false);
        });
        it('supports multiple schedule items (union)', () => {
            // Friday 13:00 — covered by item 2 ("5 12:00-14:00") but not item 1
            jest.setSystemTime(makeDate(5, 13, 0));
            scheduler.setSchedule(['1-4 09:00-17:00', '5 12:00-14:00']);
            scheduler.start();
            expect(onChange).toHaveBeenCalledWith(true);
        });
    });
    describe('start / stop / enabled', () => {
        it('enabled returns false before start()', () => {
            scheduler.setSchedule(['1-5 09:00-17:00']);
            expect(scheduler.enabled).toBe(false);
        });
        it('enabled returns true after start()', () => {
            jest.setSystemTime(makeDate(1, 10, 0));
            scheduler.setSchedule(['1-5 09:00-17:00']);
            scheduler.start();
            expect(scheduler.enabled).toBe(true);
        });
        it('enabled returns false after stop()', () => {
            jest.setSystemTime(makeDate(1, 10, 0));
            scheduler.setSchedule(['1-5 09:00-17:00']);
            scheduler.start();
            scheduler.stop();
            expect(scheduler.enabled).toBe(false);
        });
        it('calling start() twice does not register two intervals', () => {
            jest.setSystemTime(makeDate(1, 10, 0));
            scheduler.setSchedule(['1-5 09:00-17:00']);
            scheduler.start();
            scheduler.start(); // second call should be a no-op
            jest.advanceTimersByTime(30000);
            // onChange fired once on start, then once per tick — not doubled
            expect(onChange).toHaveBeenCalledTimes(1); // only the initial evaluate
        });
        it('warns and does nothing if started with no schedule', () => {
            scheduler.start();
            expect(scheduler.enabled).toBe(false);
            expect(onChange).not.toHaveBeenCalled();
        });
        it('ignores invalid schedule items gracefully', () => {
            jest.setSystemTime(makeDate(1, 10, 0));
            scheduler.setSchedule(['NOT_VALID', '1-5 09:00-17:00']);
            expect(() => scheduler.start()).not.toThrow();
            expect(onChange).toHaveBeenCalledWith(true);
        });
    });
});
