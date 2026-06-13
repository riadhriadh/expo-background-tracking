import type { ActivityChangeEvent } from './types';
export interface MotionDetectorOptions {
    /** Minutes of stillness before declaring stationary (stopTimeout). */
    stopTimeoutMinutes: number;
    /** ms of sustained motion before declaring moving (motionTriggerDelay). */
    motionTriggerDelayMs: number;
    /** Disable accelerometer sampling (disableMotionActivityUpdates). */
    disabled: boolean;
    onMotionChange: (isMoving: boolean) => void;
    onActivityChange: (activity: ActivityChangeEvent) => void;
}
/**
 * Battery-conscious motion intelligence:
 * - accelerometer variance → moving / stationary transitions
 * - GPS speed + accelerometer → activity classification
 *   (still, on_foot, walking, running, on_bicycle, in_vehicle)
 */
export declare class MotionDetector {
    private sub;
    private samples;
    private isMoving;
    private stillSince;
    private movingSince;
    private lastActivity;
    private lastSpeed;
    private opts;
    private static MOTION_THRESHOLD;
    constructor(opts: MotionDetectorOptions);
    setOptions(opts: Partial<MotionDetectorOptions>): void;
    get moving(): boolean;
    /** Force pace (changePace). */
    setMoving(isMoving: boolean): void;
    /** Feed GPS speed (m/s) for activity classification. */
    feedSpeed(speed: number | null): void;
    start(): Promise<void>;
    stop(): void;
    private evaluate;
    private noteMotion;
    private classify;
}
