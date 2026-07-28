import { describe, expect, it } from 'vitest';

import { CAT } from '@/lib/constants';

import {
    isPlayerBullet,
    isWall,
    MONSTER_PROJECTILE_MASK,
    PLAYER_BULLET_MASK,
} from '@/game/weapons/logic';

describe('weapons/logic — masks', () => {
    it('PLAYER_BULLET_MASK hits every category (Matter checks other body)', () => {
        expect(PLAYER_BULLET_MASK).toBe(0xffff);
    });

    it('MONSTER_PROJECTILE_MASK collides with character + tall walls only', () => {
        expect(MONSTER_PROJECTILE_MASK).toBe(CAT.CHARACTER | CAT.WALL_TALL);
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