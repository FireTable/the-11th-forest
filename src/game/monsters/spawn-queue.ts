/**
 * src/game/monsters/spawn-queue.ts
 * --------------------------------------------------------------------------
 * Pure reducer for trigger-gated monster spawns. Lives in its own file so
 * `tests/game/monsters/spawn-queue.test.ts` can exercise the state machine
 * without booting a Phaser scene.
 *
 * Two trigger kinds (see `MonsterTriggerSchema` in `src/lib/levels/schema.ts`):
 *
 *   - `time`  fires at `levelStartElapsedMs >= trigger.delayMs`.
 *   - `clear` fires when no monster matching its `waveId` filter is alive;
 *            then waits `trigger.delayMs` from the moment the condition
 *            first becomes true before firing.
 *
 * `delayMs` for `clear` is measured from the moment the field became
 * empty, NOT from the moment the spawn was registered. If the field
 * refills between "empty" and "delay elapsed", the timer resets.
 */

export type TriggerKind = 'time' | 'clear';

export interface PendingTrigger {
    kind: TriggerKind;
    /** `time`: ms after level start. `clear`: ms after field first becomes empty. */
    delayMs: number;
    /** `clear` only: only count monsters with this waveId as alive. Omit = any. */
    waveId?: string;
}

export interface PendingSpawn {
    /** Index into the original level.monsters array, for stable ordering. */
    index: number;
    type: string;
    x: number;
    y: number;
    trigger: PendingTrigger;
    /** Tag this spawn belongs to a named wave (informational; the reducer
     *  reads `trigger.waveId`, not this field, for gating). */
    waveId?: string;
    /** Internal: when the `clear` condition first became true. The reducer
     *  stamps this; callers should treat it as opaque. */
    clearReadyAt?: number;
}

/** Snapshot of what's alive right now, grouped by waveId. */
export interface AliveSnapshot {
    /** waveId → alive count. Use '' as the bucket for monsters with no waveId. */
    byWave: Record<string, number>;
}

export interface AdvanceResult {
    fired: PendingSpawn[];
    remaining: PendingSpawn[];
}

/** Count monsters matching the waveId filter in an alive snapshot. */
function aliveCount(alive: AliveSnapshot, waveId: string | undefined): number {
    if (waveId === undefined) {
        // "any" — sum everything.
        return Object.values(alive.byWave).reduce((s, n) => s + n, 0);
    }
    return alive.byWave[waveId] ?? 0;
}

/**
 * Decide whether a single pending spawn is ready to fire RIGHT NOW.
 * Pure — exported for testing individual rules in isolation.
 */
export function spawnReady(
    pending: PendingSpawn,
    now: number,
    alive: AliveSnapshot,
): boolean {
    const t = pending.trigger;
    if (t.kind === 'time') return now >= t.delayMs;
    // kind === 'clear'
    if (aliveCount(alive, t.waveId) > 0) return false;
    // Field is empty for our filter — fire if the post-clear delay has elapsed.
    if (pending.clearReadyAt === undefined) return false;
    return now >= pending.clearReadyAt + t.delayMs;
}

/**
 * Run the queue: split pending into `fired` (spawn now) and `remaining`
 * (still waiting). Side-effect-free — returns a fresh `remaining` list
 * with updated `clearReadyAt` stamps.
 */
export function advanceSpawnQueue(
    pending: readonly PendingSpawn[],
    now: number,
    alive: AliveSnapshot,
): AdvanceResult {
    const fired: PendingSpawn[] = [];
    const remaining: PendingSpawn[] = [];
    for (const p of pending) {
        const t = p.trigger;
        if (t.kind === 'time') {
            if (now >= t.delayMs) fired.push(p);
            else remaining.push(p);
            continue;
        }
        // kind === 'clear'
        if (aliveCount(alive, t.waveId) > 0) {
            // Field not empty — reset any prior clear stamp so the post-clear
            // delay re-measures from the next time the field empties.
            if (p.clearReadyAt !== undefined) remaining.push({ ...p, clearReadyAt: undefined });
            else remaining.push(p);
            continue;
        }
        // Field empty for our filter.
        const readyAt = p.clearReadyAt ?? now;
        if (now >= readyAt + t.delayMs) {
            fired.push(p);
        } else {
            remaining.push({ ...p, clearReadyAt: readyAt });
        }
    }
    return { fired, remaining };
}