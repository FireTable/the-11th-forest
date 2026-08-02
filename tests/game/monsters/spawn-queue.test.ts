import { describe, expect, it } from 'vitest';

import {
    advanceSpawnQueue,
    spawnReady,
    type AliveSnapshot,
    type PendingSpawn,
} from '@/game/monsters/spawn-queue';

const EMPTY: AliveSnapshot = { byWave: {} };

const timeSpawn = (delayMs: number, idx = 0): PendingSpawn => ({
    index: idx,
    type: 'drone',
    x: 0,
    y: 0,
    trigger: { kind: 'time', delayMs },
});

const clearSpawn = (waveId: string | undefined, delayMs = 0, idx = 0): PendingSpawn => ({
    index: idx,
    type: 'drone',
    x: 0,
    y: 0,
    trigger: { kind: 'clear', delayMs, waveId },
    waveId,
});

describe('monsters/spawn-queue — time trigger', () => {
    it('does not fire before delayMs', () => {
        expect(spawnReady(timeSpawn(1000), 999, EMPTY)).toBe(false);
    });

    it('fires once now >= delayMs', () => {
        expect(spawnReady(timeSpawn(1000), 1000, EMPTY)).toBe(true);
        expect(spawnReady(timeSpawn(1000), 5000, EMPTY)).toBe(true);
    });

    it('advanceSpawnQueue fires time trigger once, leaves nothing pending', () => {
        const r = advanceSpawnQueue([timeSpawn(500, 7)], 1000, EMPTY);
        expect(r.fired).toHaveLength(1);
        expect(r.fired[0].index).toBe(7);
        expect(r.remaining).toHaveLength(0);
    });
});

describe('monsters/spawn-queue — clear trigger', () => {
    it('does not fire when alive present (any wave)', () => {
        const alive: AliveSnapshot = { byWave: { '': 1 } };
        expect(spawnReady(clearSpawn(undefined), 1000, alive)).toBe(false);
    });

    it('fires when field is empty and delayMs is 0', () => {
        const p: PendingSpawn = { ...clearSpawn(undefined), clearReadyAt: 1000 };
        expect(spawnReady(p, 1000, EMPTY)).toBe(true);
    });

    it('does not fire until post-clear delayMs has elapsed', () => {
        const p: PendingSpawn = { ...clearSpawn(undefined, 500), clearReadyAt: 1000 };
        expect(spawnReady(p, 1499, EMPTY)).toBe(false);
        expect(spawnReady(p, 1500, EMPTY)).toBe(true);
    });

    it('only counts alive monsters with matching waveId', () => {
        const alive: AliveSnapshot = { byWave: { a: 0, b: 1 } };
        // Waiting on wave 'a' only — 'b' monsters don't block it.
        // (clearReadyAt pre-stamped so spawnReady sees "empty + delay elapsed".)
        const aPending: PendingSpawn = { ...clearSpawn('a'), clearReadyAt: 0 };
        expect(spawnReady(aPending, 1000, alive)).toBe(true);
        // Waiting on wave 'b' — still alive, must wait.
        const bPending: PendingSpawn = { ...clearSpawn('b'), clearReadyAt: 0 };
        expect(spawnReady(bPending, 1000, alive)).toBe(false);
    });

    it('resets clearReadyAt when field refills mid-wait', () => {
        const pending = [clearSpawn('wave-1', 1000)];
        // t=0: clear, stamp at 0
        let r = advanceSpawnQueue(pending, 0, EMPTY);
        expect(r.fired).toHaveLength(0);
        expect(r.remaining[0].clearReadyAt).toBe(0);

        // t=500: still clear, not yet ready (need 1000 ms from clear)
        r = advanceSpawnQueue(r.remaining, 500, EMPTY);
        expect(r.fired).toHaveLength(0);
        expect(r.remaining[0].clearReadyAt).toBe(0);

        // t=600: monster respawns — clearReadyAt must be reset
        const alive: AliveSnapshot = { byWave: { 'wave-1': 1 } };
        r = advanceSpawnQueue(r.remaining, 600, alive);
        expect(r.fired).toHaveLength(0);
        expect(r.remaining[0].clearReadyAt).toBeUndefined();

        // t=700: monster dies again — new stamp at 700
        r = advanceSpawnQueue(r.remaining, 700, EMPTY);
        expect(r.fired).toHaveLength(0);
        expect(r.remaining[0].clearReadyAt).toBe(700);

        // t=1699: still not ready (need 1000 ms from 700)
        r = advanceSpawnQueue(r.remaining, 1699, EMPTY);
        expect(r.fired).toHaveLength(0);

        // t=1700: ready
        r = advanceSpawnQueue(r.remaining, 1700, EMPTY);
        expect(r.fired).toHaveLength(1);
    });

    it('trigger fires only ONCE — fired spawns never re-enter queue', () => {
        const pending = [clearSpawn(undefined)];
        const r1 = advanceSpawnQueue(pending, 0, EMPTY);
        expect(r1.fired).toHaveLength(1);
        expect(r1.remaining).toHaveLength(0);
        // Calling again with empty queue yields nothing.
        const r2 = advanceSpawnQueue(r1.remaining, 5000, EMPTY);
        expect(r2.fired).toHaveLength(0);
    });
});

describe('monsters/spawn-queue — mixed batch', () => {
    it('fires time and clear spawns in the same advance call', () => {
        const pending = [
            timeSpawn(100, 1),
            clearSpawn('wave-1', 0, 2),
            timeSpawn(5000, 3), // not ready
        ];
        const r = advanceSpawnQueue(pending, 200, EMPTY);
        expect(r.fired.map((s) => s.index).sort()).toEqual([1, 2]);
        expect(r.remaining.map((s) => s.index)).toEqual([3]);
    });
});
