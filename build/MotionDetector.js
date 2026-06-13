"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MotionDetector = void 0;
const expo_sensors_1 = require("expo-sensors");
/**
 * Battery-conscious motion intelligence:
 * - accelerometer variance → moving / stationary transitions
 * - GPS speed + accelerometer → activity classification
 *   (still, on_foot, walking, running, on_bicycle, in_vehicle)
 */
class MotionDetector {
    constructor(opts) {
        this.sub = null;
        this.samples = [];
        this.isMoving = false;
        this.stillSince = null;
        this.movingSince = null;
        this.lastActivity = 'still';
        this.lastSpeed = 0;
        this.opts = opts;
    }
    setOptions(opts) {
        this.opts = { ...this.opts, ...opts };
    }
    get moving() {
        return this.isMoving;
    }
    /** Force pace (changePace). */
    setMoving(isMoving) {
        if (this.isMoving === isMoving)
            return;
        this.isMoving = isMoving;
        this.stillSince = null;
        this.movingSince = null;
        this.opts.onMotionChange(isMoving);
    }
    /** Feed GPS speed (m/s) for activity classification. */
    feedSpeed(speed) {
        if (speed == null || speed < 0)
            return;
        this.lastSpeed = speed;
        this.classify();
        // GPS speed is also strong evidence of motion
        if (speed > 1 && !this.isMoving)
            this.noteMotion(true);
    }
    async start() {
        if (this.opts.disabled)
            return;
        try {
            const available = await expo_sensors_1.Accelerometer.isAvailableAsync();
            if (!available)
                return;
        }
        catch {
            return;
        }
        expo_sensors_1.Accelerometer.setUpdateInterval(1000);
        this.sub = expo_sensors_1.Accelerometer.addListener(({ x, y, z }) => {
            const magnitude = Math.abs(Math.sqrt(x * x + y * y + z * z) - 1); // gravity-normalized
            this.samples.push(magnitude);
            if (this.samples.length > 10)
                this.samples.shift();
            if (this.samples.length >= 5)
                this.evaluate();
        });
    }
    stop() {
        this.sub?.remove();
        this.sub = null;
        this.samples = [];
        this.stillSince = null;
        this.movingSince = null;
    }
    evaluate() {
        const mean = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
        const variance = this.samples.reduce((a, b) => a + (b - mean) ** 2, 0) / this.samples.length;
        const active = variance > MotionDetector.MOTION_THRESHOLD ||
            mean > MotionDetector.MOTION_THRESHOLD * 2;
        this.noteMotion(active);
        this.classify();
    }
    noteMotion(active) {
        const now = Date.now();
        if (active) {
            this.stillSince = null;
            if (!this.isMoving) {
                if (this.movingSince == null)
                    this.movingSince = now;
                if (now - this.movingSince >= this.opts.motionTriggerDelayMs) {
                    this.isMoving = true;
                    this.movingSince = null;
                    this.opts.onMotionChange(true);
                }
            }
        }
        else {
            this.movingSince = null;
            if (this.isMoving) {
                if (this.stillSince == null)
                    this.stillSince = now;
                if (now - this.stillSince >= this.opts.stopTimeoutMinutes * 60000) {
                    this.isMoving = false;
                    this.stillSince = null;
                    this.opts.onMotionChange(false);
                }
            }
        }
    }
    classify() {
        const speed = this.lastSpeed;
        let activity;
        let confidence = 75;
        if (!this.isMoving && speed < 0.5) {
            activity = 'still';
            confidence = 90;
        }
        else if (speed < 2) {
            activity = 'walking';
        }
        else if (speed < 3.5) {
            activity = 'running';
            confidence = 60;
        }
        else if (speed < 8) {
            activity = 'on_bicycle';
            confidence = 55;
        }
        else {
            activity = 'in_vehicle';
            confidence = 85;
        }
        if (activity !== this.lastActivity) {
            this.lastActivity = activity;
            this.opts.onActivityChange({ activity, confidence });
        }
    }
}
exports.MotionDetector = MotionDetector;
// m/s² variance thresholds (device acceleration, gravity removed approx.)
MotionDetector.MOTION_THRESHOLD = 0.05;
