import { describe, expect, it } from 'vitest';

import { CAT, PROJECTILE_MONSTER_MASK, PROJECTILE_PLAYER_MASK } from '@/lib/constants';

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

describe('weapons/weapon — spawnProjectile damage binding', () => {
    it('attaches bulletDamage, bulletVelocity and aoeRadius to the Matter body', async () => {
        const { spawnProjectile } = await import('@/game/weapons/weapon');

        const mockBody: any = { position: { x: 0, y: 0 } };
        const mockScene: any = {
            matter: {
                add: {
                    circle: () => mockBody,
                },
            },
            textures: { exists: () => false },
            add: {
                rectangle: () => ({
                    setStrokeStyle: () => {},
                    setDepth: () => {},
                    setRotation: () => {},
                }),
            },
        };
        const mockMatter: any = {
            Body: {
                setVelocity: (b: any, v: any) => {
                    b.velocity = v;
                },
            },
        };

        const result = spawnProjectile(
            mockScene,
            mockMatter,
            { x: 10, y: 10 },
            { x: 1, y: 0 },
            {
                label: 'player-bullet',
                category: CAT.BULLET,
                mask: PROJECTILE_PLAYER_MASK,
                speed: 20,
                damage: 55,
                aoeRadius: 85,
                size: { radius: 6, width: 24, height: 8, color: 0xff0000 },
            },
        );

        expect(result.damage).toBe(55);
        expect((mockBody as any).bulletDamage).toBe(55);
        expect((mockBody as any).aoeRadius).toBe(85);
        expect((mockBody as any).bulletVelocity.x).toBe(20);
        expect((mockBody as any).bulletVelocity.y).toBe(0);
    });
});

describe('weapons/visual — WeaponVisualController hit flash', () => {
    it('applies 50% additive tint on hit flash and clears when deactivated', async () => {
        const { WeaponVisualController } = await import('@/game/weapons/visual');

        let currentTint = 0;
        let currentMode = 0;
        let cleared = false;

        const mockSprite: any = {
            tintMode: 0,
            setTint: (t: number) => {
                currentTint = t;
                return mockSprite;
            },
            setTintMode: (m: number) => {
                currentMode = m;
                mockSprite.tintMode = m;
                return mockSprite;
            },
            clearTint: () => {
                cleared = true;
                mockSprite.tintMode = 0;
                return mockSprite;
            },
            setOrigin: () => {},
            setScale: () => {},
            destroy: () => {},
        };

        const mockScene: any = {
            textures: { exists: () => true },
            add: {
                sprite: () => mockSprite,
            },
            tweens: { add: () => {} },
        };

        const controller = new WeaponVisualController(mockScene);
        controller.setWeapon({
            id: 'test-weapon',
            name: 'Test',
            type: 'melee',
            damage: 10,
            cooldownMs: 200,
            visual: { texture: 'test-tex' },
        } as any);

        // Flash activated
        controller.setHitFlash(true);
        expect(currentTint).toBe(0x808080);
        expect(currentMode).toBe(2);

        // Flash deactivated
        controller.setHitFlash(false);
        expect(cleared).toBe(true);
        expect(mockSprite.tintMode).toBe(0);
    });
});
