/**
 * tests/game/audios/throttle.test.ts
 * --------------------------------------------------------------------------
 * SfxThrottle — rate-limits SFX playback so a continuous trigger signal
 * (e.g. a shotgun hitting the same monster) can't spawn overlapping
 * sound instances. The class is a pure (clock, key) → allow/deny helper
 * so it stays testable without Phaser.
 */

import { describe, expect, it } from 'vitest';

import { SfxThrottle } from '@/game/audios/throttle';

describe('SfxThrottle', () => {
    it('allows every call when throttleMs is omitted', () => {
        const t = new SfxThrottle();
        expect(t.allow('a', 0)).toBe(true);
        expect(t.allow('a', 1)).toBe(true);
        expect(t.allow('a', 2)).toBe(true);
    });

    it('allows every call when throttleMs is 0 or negative', () => {
        const t = new SfxThrottle();
        expect(t.allow('a', 0, 0)).toBe(true);
        expect(t.allow('a', 1, 0)).toBe(true);
        expect(t.allow('a', 2, -100)).toBe(true);
    });

    it('denies repeated calls inside the throttle window', () => {
        const t = new SfxThrottle();
        expect(t.allow('a', 100, 80)).toBe(true);
        // 50ms later — still inside 80ms window
        expect(t.allow('a', 150, 80)).toBe(false);
        // 79ms after the first call — still inside
        expect(t.allow('a', 179, 80)).toBe(false);
    });

    it('re-allows after the window expires', () => {
        const t = new SfxThrottle();
        expect(t.allow('a', 100, 80)).toBe(true);
        // Window is `now - last < throttleMs`, so 179 → 79 < 80 → deny
        expect(t.allow('a', 179, 80)).toBe(false);
        // 180 → 80 < 80 false → reopen
        expect(t.allow('a', 180, 80)).toBe(true);
        // After the second play, the window re-anchors to 180
        expect(t.allow('a', 259, 80)).toBe(false);
        expect(t.allow('a', 260, 80)).toBe(true);
    });

    it('tracks each key independently', () => {
        const t = new SfxThrottle();
        // Monster A gets hit
        expect(t.allow('monster:a', 100, 80)).toBe(true);
        // Same instant — monster B gets hit. Different key → allowed.
        expect(t.allow('monster:b', 100, 80)).toBe(true);
        // Re-hit A — denied.
        expect(t.allow('monster:a', 100, 80)).toBe(false);
        // Re-hit B — denied.
        expect(t.allow('monster:b', 100, 80)).toBe(false);
        // After window — both allowed again.
        expect(t.allow('monster:a', 200, 80)).toBe(true);
        expect(t.allow('monster:b', 200, 80)).toBe(true);
    });

    it('denied calls do not advance the timestamp', () => {
        const t = new SfxThrottle();
        t.allow('a', 100, 80);
        // Denied
        expect(t.allow('a', 110, 80)).toBe(false);
        expect(t.allow('a', 130, 80)).toBe(false);
        // Window is still anchored to the original 100, so 180 reopens.
        expect(t.allow('a', 180, 80)).toBe(true);
    });
});
