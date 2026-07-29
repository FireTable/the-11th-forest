/**
 * src/game/weapons/weapon.ts
 * --------------------------------------------------------------------------
 * Weapon visuals — currently placeholder boxes, will be replaced by
 * sprite atlases later. Kept separate from the controller so swapping
 * visuals in (or adding weapon skins) doesn't touch behavior code.
 *
 * No `import * as Phaser` — all functions take the scene as a parameter
 * so this file can be type-only-loaded from `logic.ts` without pulling
 * the Phaser runtime into Node tests.
 *
 * Head reload indicator (above the character) lives in `hubs/status-hud.ts`
 * — that file replaces the old WeaponIndicator interface and helpers
 * that used to live here.
 */

import type * as Phaser from 'phaser';

import { DEPTH, RENDER_BULLET_TRAIL_LENGTH } from '@/lib/constants';

// ─── Bullets ─────────────────────────────────────────────────────────────

export interface BulletRecord {
    body: MatterJS.BodyType;
    rect: Phaser.GameObjects.Rectangle;
    damage: number;
    trail: { x: number; y: number }[];
}

export interface ProjectileSpawnOptions {
    label: 'player-bullet' | 'monster-projectile';
    category: number;
    mask: number;
    speed: number;
    damage: number;
    size: { radius: number; width: number; height: number; color: number };
}

/**
 * Spawn a single projectile body + placeholder rectangle at origin, fired
 * along `direction`. Used by both player's WeaponController and monsters'
 * performAttack (so all ranged attacks share the same physics).
 */
export function spawnProjectile(
    scene: Phaser.Scene,
    matter: any,
    origin: { x: number; y: number },
    direction: { x: number; y: number },
    opts: ProjectileSpawnOptions,
): BulletRecord {
    const len = Math.hypot(direction.x, direction.y);
    if (len === 0) throw new Error('spawnProjectile: zero-length direction');
    const { radius, width, height, color } = opts.size;

    const body = scene.matter.add.circle(origin.x, origin.y, radius, {
        label: opts.label,
        collisionFilter: {
            category: opts.category,
            mask: opts.mask,
        },
    });
    matter.Body.setVelocity(body, {
        x: (direction.x / len) * opts.speed,
        y: (direction.y / len) * opts.speed,
    });

    const rect = scene.add.rectangle(origin.x, origin.y, width, height, color);
    rect.setStrokeStyle(1, 0x14532d, 1);
    rect.setRotation(Math.atan2(direction.y, direction.x));

    return { body, rect, damage: opts.damage, trail: [] };
}

/** Destroy a bullet's body + visual. */
export function destroyBulletVisual(scene: Phaser.Scene, bullet: BulletRecord): void {
    bullet.rect.destroy();
    scene.matter.world.remove(bullet.body);
}

/** Compute velocity { x, y } for a bullet fired at `angle` with given `speed`. */
export function bulletVelocity(
    angle: number,
    speed: number,
): { x: number; y: number } {
    return {
        x: Math.cos(angle) * speed,
        y: Math.sin(angle) * speed,
    };
}

// ─── Trail renderer ─────────────────────────────────────────────────────

export interface BulletTrail {
    graphics: Phaser.GameObjects.Graphics;
    positions: { x: number; y: number }[];
}



/** Create the shared trail graphics (one for all bullets). */
export function createBulletTrail(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
    const g = scene.add.graphics();
    g.setDepth(DEPTH.BULLET_TRAIL);
    return g;
}

/** Push the current body position onto this bullet's trail and trim to max length. */
export function pushBulletTrail(bullet: BulletRecord, trail: BulletTrail): void {
    const p = bullet.body.position;
    trail.positions.push({ x: p.x, y: p.y });
    if (trail.positions.length > RENDER_BULLET_TRAIL_LENGTH) trail.positions.shift();
}

/** Draw all bullet trails onto the shared graphics, then clear. */
export function renderBulletTrails(
    graphics: Phaser.GameObjects.Graphics,
    bullets: readonly BulletRecord[],
): void {
    graphics.clear();
    for (const b of bullets) {
        const trail = b.trail;
        if (!trail || trail.length < 2) continue;
        for (let k = 1; k < trail.length; k++) {
            const alpha = k / (trail.length - 1);
            graphics.lineStyle(3, 0x22c55e, alpha * 0.7);
            graphics.beginPath();
            graphics.moveTo(trail[k - 1].x, trail[k - 1].y);
            graphics.lineTo(trail[k].x, trail[k].y);
            graphics.strokePath();
        }
    }
}
