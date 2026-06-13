"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const EventBus_1 = require("../EventBus");
describe('EventBus', () => {
    let bus;
    beforeEach(() => {
        bus = new EventBus_1.EventBus();
    });
    describe('on / emit', () => {
        it('delivers events to registered listeners', () => {
            const fn = jest.fn();
            bus.on('location', fn);
            bus.emit('location', { coords: { latitude: 1 } });
            expect(fn).toHaveBeenCalledTimes(1);
            expect(fn).toHaveBeenCalledWith({ coords: { latitude: 1 } });
        });
        it('delivers to multiple listeners on the same event', () => {
            const a = jest.fn();
            const b = jest.fn();
            bus.on('location', a);
            bus.on('location', b);
            bus.emit('location', 'payload');
            expect(a).toHaveBeenCalledTimes(1);
            expect(b).toHaveBeenCalledTimes(1);
        });
        it('does not cross-deliver between different event names', () => {
            const onLocation = jest.fn();
            const onMotion = jest.fn();
            bus.on('location', onLocation);
            bus.on('motionchange', onMotion);
            bus.emit('location', 'loc');
            expect(onLocation).toHaveBeenCalledTimes(1);
            expect(onMotion).not.toHaveBeenCalled();
        });
        it('emitting to an event with no listeners is a no-op', () => {
            expect(() => bus.emit('heartbeat', {})).not.toThrow();
        });
        it('delivers multiple events in order', () => {
            const calls = [];
            bus.on('location', (e) => calls.push(e));
            bus.emit('location', 1);
            bus.emit('location', 2);
            bus.emit('location', 3);
            expect(calls).toEqual([1, 2, 3]);
        });
    });
    describe('subscription.remove()', () => {
        it('stops delivering after remove()', () => {
            const fn = jest.fn();
            const sub = bus.on('location', fn);
            bus.emit('location', 'first');
            sub.remove();
            bus.emit('location', 'second');
            expect(fn).toHaveBeenCalledTimes(1);
        });
        it('removing one listener does not affect others', () => {
            const a = jest.fn();
            const b = jest.fn();
            const subA = bus.on('location', a);
            bus.on('location', b);
            subA.remove();
            bus.emit('location', 'x');
            expect(a).not.toHaveBeenCalled();
            expect(b).toHaveBeenCalledTimes(1);
        });
        it('double-remove is safe', () => {
            const sub = bus.on('location', jest.fn());
            sub.remove();
            expect(() => sub.remove()).not.toThrow();
        });
    });
    describe('listener error isolation', () => {
        it('continues emitting to remaining listeners when one throws', () => {
            const bad = jest.fn(() => { throw new Error('boom'); });
            const good = jest.fn();
            bus.on('location', bad);
            bus.on('location', good);
            expect(() => bus.emit('location', 'x')).not.toThrow();
            expect(good).toHaveBeenCalledTimes(1);
        });
    });
    describe('removeAll()', () => {
        it('removeAll() with no name clears all listeners', () => {
            const a = jest.fn();
            const b = jest.fn();
            bus.on('location', a);
            bus.on('heartbeat', b);
            bus.removeAll();
            bus.emit('location', 'x');
            bus.emit('heartbeat', 'y');
            expect(a).not.toHaveBeenCalled();
            expect(b).not.toHaveBeenCalled();
        });
        it('removeAll(name) only clears that event', () => {
            const a = jest.fn();
            const b = jest.fn();
            bus.on('location', a);
            bus.on('heartbeat', b);
            bus.removeAll('location');
            bus.emit('location', 'x');
            bus.emit('heartbeat', 'y');
            expect(a).not.toHaveBeenCalled();
            expect(b).toHaveBeenCalledTimes(1);
        });
    });
});
