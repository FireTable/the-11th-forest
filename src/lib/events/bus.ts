// Pure, Phaser-free cross-boundary event bus.
// Lives in src/lib/events/ because both the React layer (src/PhaserGame.tsx)
// and the Phaser scenes import it — it's the canonical example of a
// shared utility that belongs in src/lib/.
// ponytail: same surface as Phaser's Events.EventEmitter —
// on / off / removeListener / removeAllListeners / emit. Replace the
// body with a full EventEmitter when the surface grows.

type Listener = (payload?: any) => void;

class EventBusImpl {
    private readonly listeners = new Map<string, Set<Listener>>();

    on(event: string, fn: Listener): void {
        let set = this.listeners.get(event);
        if (!set) {
            set = new Set();
            this.listeners.set(event, set);
        }
        set.add(fn);
    }

    off(event: string, fn: Listener): void {
        this.listeners.get(event)?.delete(fn);
    }

    removeListener(event: string, fn?: Listener): void {
        if (fn) this.off(event, fn);
        else this.listeners.delete(event);
    }

    removeAllListeners(event?: string): void {
        if (event) this.listeners.delete(event);
        else this.listeners.clear();
    }

    emit(event: string, payload?: any): void {
        this.listeners.get(event)?.forEach((fn) => fn(payload));
    }
}

export const EventBus = new EventBusImpl();
export type { Listener };