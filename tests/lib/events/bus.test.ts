import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '@/lib/events/bus';

describe('EventBus', () => {
    it('emits events with payload to a registered listener', () => {
        const handler = vi.fn();
        EventBus.on('forest:hello', handler);

        EventBus.emit('forest:hello', { who: 'hunter' });

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith({ who: 'hunter' });

        EventBus.off('forest:hello', handler);
    });

    it('delivers events to multiple listeners', () => {
        const a = vi.fn();
        const b = vi.fn();
        EventBus.on('forest:multi', a);
        EventBus.on('forest:multi', b);

        EventBus.emit('forest:multi', 42);

        expect(a).toHaveBeenCalledWith(42);
        expect(b).toHaveBeenCalledWith(42);

        EventBus.off('forest:multi', a);
        EventBus.off('forest:multi', b);
    });

    it('stops invoking a removed listener', () => {
        const handler = vi.fn();
        EventBus.on('forest:once', handler);
        EventBus.off('forest:once', handler);

        EventBus.emit('forest:once', 'ignored');

        expect(handler).not.toHaveBeenCalled();
    });

    it('removeListener(event) without fn drops all listeners for that event', () => {
        const a = vi.fn();
        const b = vi.fn();
        EventBus.on('forest:all', a);
        EventBus.on('forest:all', b);

        EventBus.removeListener('forest:all');

        EventBus.emit('forest:all', 'ignored');

        expect(a).not.toHaveBeenCalled();
        expect(b).not.toHaveBeenCalled();
    });
});