import { Accelerometer } from 'expo-sensors';
import type { ActivityChangeEvent, MotionActivityType } from './types';

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
export class MotionDetector {
  private sub: { remove(): void } | null = null;
  private samples: number[] = [];
  private isMoving = false;
  private stillSince: number | null = null;
  private movingSince: number | null = null;
  private lastActivity: MotionActivityType = 'still';
  private lastSpeed = 0;
  private opts: MotionDetectorOptions;

  // m/s² variance thresholds (device acceleration, gravity removed approx.)
  private static MOTION_THRESHOLD = 0.05;

  constructor(opts: MotionDetectorOptions) {
    this.opts = opts;
  }

  setOptions(opts: Partial<MotionDetectorOptions>): void {
    this.opts = { ...this.opts, ...opts };
  }

  get moving(): boolean {
    return this.isMoving;
  }

  /** Force pace (changePace). */
  setMoving(isMoving: boolean): void {
    if (this.isMoving === isMoving) return;
    this.isMoving = isMoving;
    this.stillSince = null;
    this.movingSince = null;
    this.opts.onMotionChange(isMoving);
  }

  /** Feed GPS speed (m/s) for activity classification. */
  feedSpeed(speed: number | null): void {
    if (speed == null || speed < 0) return;
    this.lastSpeed = speed;
    this.classify();
    // GPS speed is also strong evidence of motion
    if (speed > 1 && !this.isMoving) this.noteMotion(true);
  }

  async start(): Promise<void> {
    if (this.opts.disabled) return;
    try {
      const available = await Accelerometer.isAvailableAsync();
      if (!available) return;
    } catch {
      return;
    }
    Accelerometer.setUpdateInterval(1000);
    this.sub = Accelerometer.addListener(({ x, y, z }) => {
      const magnitude = Math.abs(Math.sqrt(x * x + y * y + z * z) - 1); // gravity-normalized
      this.samples.push(magnitude);
      if (this.samples.length > 10) this.samples.shift();
      if (this.samples.length >= 5) this.evaluate();
    });
  }

  stop(): void {
    this.sub?.remove();
    this.sub = null;
    this.samples = [];
    this.stillSince = null;
    this.movingSince = null;
  }

  private evaluate(): void {
    const mean = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
    const variance =
      this.samples.reduce((a, b) => a + (b - mean) ** 2, 0) / this.samples.length;
    const active =
      variance > MotionDetector.MOTION_THRESHOLD ||
      mean > MotionDetector.MOTION_THRESHOLD * 2;
    this.noteMotion(active);
    this.classify();
  }

  private noteMotion(active: boolean): void {
    const now = Date.now();
    if (active) {
      this.stillSince = null;
      if (!this.isMoving) {
        if (this.movingSince == null) this.movingSince = now;
        if (now - this.movingSince >= this.opts.motionTriggerDelayMs) {
          this.isMoving = true;
          this.movingSince = null;
          this.opts.onMotionChange(true);
        }
      }
    } else {
      this.movingSince = null;
      if (this.isMoving) {
        if (this.stillSince == null) this.stillSince = now;
        if (now - this.stillSince >= this.opts.stopTimeoutMinutes * 60_000) {
          this.isMoving = false;
          this.stillSince = null;
          this.opts.onMotionChange(false);
        }
      }
    }
  }

  private classify(): void {
    const speed = this.lastSpeed;
    let activity: MotionActivityType;
    let confidence = 75;
    if (!this.isMoving && speed < 0.5) {
      activity = 'still';
      confidence = 90;
    } else if (speed < 2) {
      activity = 'walking';
    } else if (speed < 3.5) {
      activity = 'running';
      confidence = 60;
    } else if (speed < 8) {
      activity = 'on_bicycle';
      confidence = 55;
    } else {
      activity = 'in_vehicle';
      confidence = 85;
    }
    if (activity !== this.lastActivity) {
      this.lastActivity = activity;
      this.opts.onActivityChange({ activity, confidence });
    }
  }
}
