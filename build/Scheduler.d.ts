import type { ScheduleItem } from './types';
/**
 * Weekly schedule engine — "1-5 09:00-17:00" style entries
 * (same syntax as transistorsoft). JS timer-based: evaluated every
 * 30 s while the app runs; state re-evaluated on resume.
 */
export declare class Scheduler {
    private onScheduleChange;
    private timer;
    private schedules;
    private lastShouldBeEnabled;
    constructor(onScheduleChange: (enabled: boolean) => void);
    get enabled(): boolean;
    setSchedule(items: ScheduleItem[]): void;
    start(): void;
    stop(): void;
    private evaluate;
    private parse;
}
