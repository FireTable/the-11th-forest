import { describe, expect, it } from 'vitest';

import { clampToBounds, dodgeIntent, moveIntent, resolveHurtSfx } from '@/game/characters/logic';

describe('characters/logic — moveIntent', () => {
    it('returns zero when no key pressed', () => {
        expect(moveIntent({ up: false, down: false, left: false, right: false })).toEqual({
            vx: 0,
            vy: 0,
        });
    });

    it('returns unit vector for a single cardinal key', () => {
        expect(moveIntent({ up: true, down: false, left: false, right: false })).toEqual({
            vx: 0,
            vy: -1,
        });
        expect(moveIntent({ up: false, down: false, left: false, right: true })).toEqual({
            vx: 1,
            vy: 0,
        });
    });

    it('normalises diagonal inputs to length 1', () => {
        const r = moveIntent({ up: true, down: false, left: false, right: true });
        expect(Math.hypot(r.vx, r.vy)).toBeCloseTo(1);
        // up cancels down, so this is purely horizontal
        // (vy=-1, vx=1) — both up+right pressed → (1, -1) normalised
        const r2 = moveIntent({ up: true, down: false, left: false, right: true });
        expect(r2.vx).toBeCloseTo(Math.SQRT1_2);
        expect(r2.vy).toBeCloseTo(-Math.SQRT1_2);
    });

    it('cancels opposing axes', () => {
        expect(moveIntent({ up: true, down: true, left: false, right: false })).toEqual({
            vx: 0,
            vy: 0,
        });
    });
});

describe('characters/logic — dodgeIntent', () => {
    const NO_INTENT = { vx: 0, vy: 0 };
    const FWD = { vx: 1, vy: 0 };

    it('returns null when shift not pressed', () => {
        expect(
            dodgeIntent(false, FWD, 100, 15, 600, 0, 0, 28, 1000),
        ).toBeNull();
    });

    it('returns null when no movement intent', () => {
        expect(
            dodgeIntent(true, NO_INTENT, 100, 15, 600, 0, 0, 28, 1000),
        ).toBeNull();
    });

    it('returns null when SP below cost', () => {
        expect(
            dodgeIntent(true, FWD, 10, 15, 600, 0, 0, 28, 1000),
        ).toBeNull();
    });

    it('returns null when cooldown not elapsed', () => {
        // lastDodgeEndAt=900, now=1000, cooldown=600 → only 100ms passed
        expect(
            dodgeIntent(true, FWD, 100, 15, 600, 900, 0, 28, 1000),
        ).toBeNull();
    });

    it('returns null when a previous dodge is still active', () => {
        // dodgeActiveUntil=1200, now=1000 → still dodging
        expect(
            dodgeIntent(true, FWD, 100, 15, 600, 0, 1200, 28, 1000),
        ).toBeNull();
    });

    it('returns dodge velocity when all conditions met', () => {
        const r = dodgeIntent(true, FWD, 100, 15, 600, 0, 0, 28, 1000);
        expect(r).toEqual({ vx: 28, vy: 0 });
    });
});

describe('characters/logic — clampToBounds', () => {
    it('returns null when inside bounds', () => {
        expect(clampToBounds({ x: 100, y: 100 }, 16, 24, 1000, 1000)).toBeNull();
    });

    it('clamps negative coordinates to half-size', () => {
        expect(clampToBounds({ x: -50, y: 100 }, 16, 24, 1000, 1000)).toEqual({
            x: 16,
            y: 100,
        });
    });

    it('clamps beyond the right/bottom edge', () => {
        expect(clampToBounds({ x: 9999, y: 9999 }, 16, 24, 1000, 1000)).toEqual({
            x: 984,
            y: 976,
        });
    });

    it('preserves coords on the in-bounds axis', () => {
        const r = clampToBounds({ x: -50, y: 500 }, 16, 24, 1000, 1000);
        expect(r).toEqual({ x: 16, y: 500 });
    });
});
describe('characters/logic — resolveHurtSfx', () => {
    it('returns female variant when gender=female and hurtFemale set', () => {
        expect(resolveHurtSfx({ gender: 'female', sfx: { hurtFemale: 'f', hurtMale: 'm', hurt: 'n' } })).toBe('f');
    });

    it('returns male variant when gender=male and hurtMale set', () => {
        expect(resolveHurtSfx({ gender: 'male', sfx: { hurtFemale: 'f', hurtMale: 'm', hurt: 'n' } })).toBe('m');
    });

    it('falls back to hurt when gender set but per-gender field missing', () => {
        expect(resolveHurtSfx({ gender: 'female', sfx: { hurt: 'n' } })).toBe('n');
        expect(resolveHurtSfx({ gender: 'male', sfx: { hurt: 'n' } })).toBe('n');
    });

    it('returns null when no sfx block configured', () => {
        expect(resolveHurtSfx({ gender: 'female' })).toBeNull();
    });

    it('returns null when sfx block empty', () => {
        expect(resolveHurtSfx({ gender: 'female', sfx: {} })).toBeNull();
    });

    it('returns hurt when no gender set (gender-neutral fallback)', () => {
        expect(resolveHurtSfx({ sfx: { hurt: 'n' } })).toBe('n');
    });
});
