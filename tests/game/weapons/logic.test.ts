import { describe, expect, it } from 'vitest';

import {
    CAT,
    PROJECTILE_MONSTER_MASK,
    PROJECTILE_PLAYER_MASK,
} from '@/lib/constants';

import { isPlayerBullet, isWall } from '@/game/weapons/logic';

describe('weapons/logic — masks', () => {
    it('PROJECTILE_PLAYER_MASK hits every category (Matter checks other body)', () => {
        expect(PROJECTILE_PLAYER_MASK).toBe(0xffff);
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
});