/**
 * src/game/audios/throttle.ts
 * --------------------------------------------------------------------------
 * Per-key rate limit for SFX playback. Used by AudioController so a
 * continuous trigger signal (multiple bullets hitting the same monster,
 * sustained fire into a wall, etc.) can't spawn overlapping instances
 * of the same SFX within a short window.
 *
 * Pure clock + key → allow/deny so it stays testable without Phaser.
 *
 * Key convention: callers compose the key from the SFX id AND the
 * entity that triggered it, e.g. `` `monster:${specId}:hit` ``. That
 * way two different monsters (or two different weapons) firing the
 * same SFX in the same instant both play.
 */

export class SfxThrottle {
    private readonly lastPlayedAt = new Map<string, number>();

    /**
     * Returns true if the SFX should play right now (and stamps the
     * timestamp). Returns false if still inside the throttle window —
     * denied calls do NOT advance the timestamp, so the window stays
     * anchored to the last successful play.
     *
     * @param key      identifier the throttle tracks (e.g. `` `monster:${id}` ``)
     * @param now      current scene time in ms
     * @param throttleMs  minimum gap between plays; omit / 0 / negative to disable
     */
    allow(key: string, now: number, throttleMs?: number): boolean {
        if (!throttleMs || throttleMs <= 0) return true;
        const last = this.lastPlayedAt.get(key);
        if (last !== undefined && now - last < throttleMs) return false;
        this.lastPlayedAt.set(key, now);
        return true;
    }
}
