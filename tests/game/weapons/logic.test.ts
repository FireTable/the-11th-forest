import { describe, expect, it } from 'vitest';

import {
    CAT,
    PROJECTILE_MONSTER_MASK,
    PROJECTILE_PLAYER_MASK,
} from '@/lib/constants';

import { isPlayerBullet, isWall, nextSlotIndex } from '@/game/weapons/logic';

describe('weapons/logic — masks', () => {
    it('PROJECTILE_PLAYER_MASK hits tall walls + monsters, ignores short walls (cover)', () => {
        // Mirrors the monster-mask pattern: a bullet shouldn't see what
        // it can't collide with, otherwise it would try to register a
        // short-wall hit and get destroyed mid-flight.
        expect(PROJECTILE_PLAYER_MASK).toBe(
            CAT.WALL_TALL | CAT.MONSTER_MELEE | CAT.MONSTER_PROJECTILE,
        );
        // Sanity: short wall bit is explicitly excluded.
        expect(PROJECTILE_PLAYER_MASK & CAT.WALL_SHORT).toBe(0);
    });

    it('PROJECTILE_MONSTER_MASK collides with character + tall walls only', () => {
        expect(PROJECTILE_MONSTER_MASK).toBe(CAT.CHARACTER | CAT.WALL_TALL);
    });
});

describe('weapons/logic — body label helpers', () => {
    it('isPlayerBullet matches only player-bullet label', () => {
        expect(isPlayerBullet({ label: 'player-bullet' })).toBe(true);
        expect(isPlayerBullet({ label: 'monster-projectile' })).toBe(false);
        expect(isPlayerBullet({})).toBe(false);
    });

    it('isWall matches wall:<id> labels', () => {
        expect(isWall({ label: 'wall:1' })).toBe(true);
        expect(isWall({ label: 'wall:abc' })).toBe(true);
        expect(isWall({ label: 'character' })).toBe(false);
        expect(isWall({ label: 'monster' })).toBe(false);
        expect(isWall({})).toBe(false);
    });

    it('tall wall vs short wall / character category distinction', () => {
        const tallWallCat = CAT.WALL_TALL;
        const shortWallCat = CAT.WALL_SHORT;
        const charCat = CAT.CHARACTER;

        expect((tallWallCat & CAT.WALL_TALL) !== 0).toBe(true);
        expect((shortWallCat & CAT.WALL_TALL) !== 0).toBe(false);
        expect((charCat & CAT.WALL_TALL) !== 0).toBe(false);
    });
});

describe('weapons/logic — nextSlotIndex (mobile ◀/▶ cycle math)', () => {
    it('advances forward within the slot list', () => {
        expect(nextSlotIndex(0, 1, 3)).toBe(1);
        expect(nextSlotIndex(1, 1, 3)).toBe(2);
    });

    it('wraps forward from the last slot back to the first', () => {
        expect(nextSlotIndex(2, 1, 3)).toBe(0);
    });

    it('wraps backward from the first slot to the last', () => {
        expect(nextSlotIndex(0, -1, 3)).toBe(2);
    });

    it('steps backward within the list', () => {
        expect(nextSlotIndex(2, -1, 3)).toBe(1);
        expect(nextSlotIndex(1, -1, 3)).toBe(0);
    });

    it('returns 0 for a single-slot hotbar regardless of direction', () => {
        expect(nextSlotIndex(0, 1, 1)).toBe(0);
        expect(nextSlotIndex(0, -1, 1)).toBe(0);
    });

    it('returns 0 for an empty hotbar as a no-op safety', () => {
        expect(nextSlotIndex(0, 1, 0)).toBe(0);
    });

    it('coerces non-integer currentIndex via floor', () => {
        expect(nextSlotIndex(0.7, 1, 3)).toBe(1);
    });
});