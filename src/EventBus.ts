import type { EventName, Subscription } from './types';

type Listener = (event: unknown) => void;

/** Minimal dependency-free event emitter. */
export class EventBus {
  private listeners = new Map<EventName, Set<Listener>>();

  on(name: EventName, fn: Listener): Subscription {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    const set = this.listeners.get(name)!;
    set.add(fn);
    return { remove: () => set.delete(fn) };
  }

  emit(name: EventName, event: unknown): void {
    const set = this.listeners.get(name);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        fn(event);
      } catch (e) {
        // listener errors must never break the tracking pipeline
        console.warn(`[expo-background-tracking] listener error (${name})`, e);
      }
    }
  }

  removeAll(name?: EventName): void {
    if (name) this.listeners.delete(name);
    else this.listeners.clear();
  }
}
