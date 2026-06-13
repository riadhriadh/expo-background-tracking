import type { EventName, Subscription } from './types';
type Listener = (event: unknown) => void;
/** Minimal dependency-free event emitter. */
export declare class EventBus {
    private listeners;
    on(name: EventName, fn: Listener): Subscription;
    emit(name: EventName, event: unknown): void;
    removeAll(name?: EventName): void;
}
export {};
