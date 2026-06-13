"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventBus = void 0;
/** Minimal dependency-free event emitter. */
class EventBus {
    constructor() {
        this.listeners = new Map();
    }
    on(name, fn) {
        if (!this.listeners.has(name))
            this.listeners.set(name, new Set());
        const set = this.listeners.get(name);
        set.add(fn);
        return { remove: () => set.delete(fn) };
    }
    emit(name, event) {
        const set = this.listeners.get(name);
        if (!set)
            return;
        for (const fn of [...set]) {
            try {
                fn(event);
            }
            catch (e) {
                // listener errors must never break the tracking pipeline
                console.warn(`[expo-background-tracking] listener error (${name})`, e);
            }
        }
    }
    removeAll(name) {
        if (name)
            this.listeners.delete(name);
        else
            this.listeners.clear();
    }
}
exports.EventBus = EventBus;
