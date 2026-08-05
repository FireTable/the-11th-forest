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
        // hasSeenAlive pre-stamped — target wave was already observed.
        const p: PendingSpawn = { ...clearSpawn(undefined), clearReadyAt: 1000, hasSeenAlive: true };
        expect(spawnReady(p, 1000, EMPTY)).toBe(true);
    });

    it('does not fire until post-clear delayMs has elapsed', () => {
        const p: PendingSpawn = { ...clearSpawn(undefined, 500), clearReadyAt: 1000, hasSeenAlive: true };
        expect(spawnReady(p, 1499, EMPTY)).toBe(false);
        expect(spawnReady(p, 1500, EMPTY)).toBe(true);
    });

    it('only counts alive monsters with matching waveId', () => {
        const alive: AliveSnapshot = { byWave: { a: 0, b: 1 } };
        // Waiting on wave 'a' only — 'b' monsters don't block it.
        // (clearReadyAt pre-stamped so spawnReady sees "empty + delay elapsed".)
        const aPending: PendingSpawn = { ...clearSpawn('a'), clearReadyAt: 0, hasSeenAlive: true };
        expect(spawnReady(aPending, 1000, alive)).toBe(true);
        // Waiting on wave 'b' — still alive, must wait.
        const bPending: PendingSpawn = { ...clearSpawn('b'), clearReadyAt: 0, hasSeenAlive: true };
        expect(spawnReady(bPending, 1000, alive)).toBe(false);
    });

    it('resets clearReadyAt when field refills mid-wait', () => {
        // Start with hasSeenAlive=true so the empty-field stamps begin
        // firing (the gate requires observing alive at least once).
        const pending = [{ ...clearSpawn('wave-1', 1000), hasSeenAlive: true }];
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
        const pending = [{ ...clearSpawn(undefined), hasSeenAlive: true }];
        const r1 = advanceSpawnQueue(pending, 0, EMPTY);
        expect(r1.fired).toHaveLength(1);
        expect(r1.remaining).toHaveLength(0);
        // Calling again with empty queue yields nothing.
        const r2 = advanceSpawnQueue(r1.remaining, 5000, EMPTY);
        expect(r2.fired).toHaveLength(0);
    });
});

describe('monsters/spawn-queue — mixed batch', () => {
    it('time spawn fires immediately, clear waits for target wave to empty', () => {
        // The two triggers measure different things — `time` is a wall
        // clock; `clear` only fires after the target wave has actually
        // had members and now has none. Mixing both: time spawn fires
        // when its delay elapses; clear spawn fires on the tick after
        // the target wave empties.
        const pending = [
            timeSpawn(100, 1),
            // Pretend wave-1 was alive and has been observed; with delay=0
            // the clear fires the moment the field is empty.
            { ...clearSpawn('wave-1', 0, 2), hasSeenAlive: true },
            timeSpawn(5000, 3), // not ready
        ];
        // Wave-1 still alive → time fires, clear waits.
        let r = advanceSpawnQueue(pending, 200, { byWave: { 'wave-1': 1 } });
        expect(r.fired.map((s) => s.index)).toEqual([1]);
        expect(r.remaining.map((p) => p.index)).toEqual([2, 3]);
        // Wave-1 just emptied → clear fires (delay 0), time-5000 still waits.
        r = advanceSpawnQueue(r.remaining, 300, EMPTY);
        expect(r.fired.map((s) => s.index)).toEqual([2]);
        expect(r.remaining.map((p) => p.index)).toEqual([3]);
    });

    it('clear spawn does NOT fire before its target wave has ever been alive', () => {
        // Regression: a clear trigger waits on a target wave whose spawns
        // haven't fired yet. The field is empty by default, so without
        // the hasSeenAlive gate this would fire on the first advance
        // tick and collapse every wave into a single burst.
        const pending = [
            timeSpawn(500, 0), // wave-1 spawns at t=500
            clearSpawn('wave-1', 0, 1), // wave-2 gated on wave-1 clear
            clearSpawn('wave-2', 0, 2), // wave-3 gated on wave-2 clear
        ];
        // t=200: no monsters alive yet (time trigger not ready)
        let r = advanceSpawnQueue(pending, 200, EMPTY);
        expect(r.fired).toHaveLength(0);
        expect(r.remaining.map((p) => p.index)).toEqual([0, 1, 2]);

        // t=600: time trigger fired wave-1, monster alive
        r = advanceSpawnQueue(r.remaining, 600, { byWave: { 'wave-1': 1 } });
        expect(r.fired.map((s) => s.index)).toEqual([0]);
        // wave-2/3 still waiting — wave-1 alive, hasSeenAlive=false
        expect(r.remaining.map((p) => p.index)).toEqual([1, 2]);

        // t=700: wave-1 cleared (monster died)
        r = advanceSpawnQueue(r.remaining, 700, EMPTY);
        // wave-2 fires immediately (delayMs=0), wave-3 still waiting
        // because it hasn't seen wave-2 alive yet.
        expect(r.fired.map((s) => s.index)).toEqual([1]);
        expect(r.remaining.map((p) => p.index)).toEqual([2]);
    });
});
