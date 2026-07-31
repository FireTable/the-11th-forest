/**
 * tests/lib/dev/cheats.test.ts
 * --------------------------------------------------------------------------
 * Pure cheats module — dev detection + localStorage-backed toggles +
 * EventBus notification.
 *
 * Tests inject a fake Storage + stub `window.location` / `import.meta.env`
 * via the optional `isDev` args so we don't have to mock globals.
 */

import { describe, expect, it } from 'vitest';

import { applyCheat, getCheats, isDev, loadCheats, saveCheats } from '@/lib/dev/cheats';
import { EventBus } from '@/lib/events/bus';

class MemoryStorage implements Storage {
    private store = new Map<string, string>();
    get length(): number {
        return this.store.size;
    }
    key(i: number): string | null {
        return [...this.store.keys()][i] ?? null;
    }
    getItem(k: string): string | null {
        return this.store.get(k) ?? null;
    }
    setItem(k: string, v: string): void {
        this.store.set(k, v);
    }
    removeItem(k: string): void {
        this.store.delete(k);
    }
    clear(): void {
        this.store.clear();
    }
}

describe('isDev', () => {
    it('returns true only when both viteDev AND hostname is local', () => {
        expect(isDev({ viteDev: true, hostname: 'localhost' })).toBe(true);
        expect(isDev({ viteDev: true, hostname: '127.0.0.1' })).toBe(true);
        expect(isDev({ viteDev: true, hostname: '[::1]' })).toBe(true);
    });

    it('returns false when viteDev is false (built/prod)', () => {
        expect(isDev({ viteDev: false, hostname: 'localhost' })).toBe(false);
    });

    it('returns false on non-local hostnames even in vite dev', () => {
        expect(isDev({ viteDev: true, hostname: 'the-11th-forest.com' })).toBe(false);
        expect(isDev({ viteDev: true, hostname: '0.0.0.0' })).toBe(false);
        expect(isDev({ viteDev: true, hostname: '' })).toBe(false);
    });

    it('defaults: viteDev=true in vite dev, hostname from window.location', () => {
        // The test environment is node — both defaults resolve to "off".
        // Production code paths use the env-provided values; this test
        // pins the default behavior for the node test runner.
        expect(isDev()).toBe(false);
    });
});

describe('loadCheats / saveCheats', () => {
    it('returns defaults on empty storage', () => {
        const s = new MemoryStorage();
        expect(loadCheats(s)).toEqual({ infiniteHp: false, muted: false });
    });

    it('round-trips a full state', () => {
        const s = new MemoryStorage();
        saveCheats({ infiniteHp: true, muted: true }, s);
        expect(loadCheats(s)).toEqual({ infiniteHp: true, muted: true });
    });

    it('falls back to per-field defaults when a key is missing', () => {
        const s = new MemoryStorage();
        s.setItem('dev.cheats', JSON.stringify({ muted: true }));
        expect(loadCheats(s)).toEqual({ infiniteHp: false, muted: true });
    });

    it('ignores corrupt JSON and returns defaults', () => {
        const s = new MemoryStorage();
        s.setItem('dev.cheats', '{not json');
        expect(loadCheats(s)).toEqual({ infiniteHp: false, muted: false });
    });
});

describe('applyCheat', () => {
    it('persists to storage and emits a dev:cheat:* event', () => {
        const s = new MemoryStorage();
        const received: any[] = [];
        const handler = (p?: any) => received.push(p);
        EventBus.on('dev:cheat:infiniteHp', handler);

        try {
            applyCheat('infiniteHp', true, s);

            expect(received).toEqual([{ key: 'infiniteHp', value: true }]);
            expect(loadCheats(s)).toEqual({ infiniteHp: true, muted: false });
            expect(getCheats(s)).toEqual({ infiniteHp: true, muted: false });
        } finally {
            EventBus.removeListener('dev:cheat:infiniteHp', handler);
        }
    });

    it('toggling off restores the default state', () => {
        const s = new MemoryStorage();
        applyCheat('muted', true, s);
        expect(getCheats(s).muted).toBe(true);

        applyCheat('muted', false, s);
        expect(getCheats(s).muted).toBe(false);
    });
});