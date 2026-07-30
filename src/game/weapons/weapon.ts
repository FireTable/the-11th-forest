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

import { CAT, DEPTH, PROJECTILE_PLAYER_MASK, RENDER_BULLET_TRAIL_LENGTH } from '@/lib/constants';
import type { WeaponSpec } from '@/lib/weapons';

/**
 * Queue weapon and paired bullet texture assets into the Phaser Loader.
 */
export function loadWeaponAssets(
    scene: Phaser.Scene,
    weaponSpecs: Iterable<WeaponSpec>,
): void {
    for (const spec of weaponSpecs) {
        if (spec.visual?.texture && !scene.textures.exists(spec.visual.texture)) {
            const url = spec.visual.texture.startsWith('/') ? spec.visual.texture : `/${spec.visual.texture}`;
            scene.load.image(spec.visual.texture, url);
        }
        if (spec.bullet?.texture && !scene.textures.exists(spec.bullet.texture)) {
            const url = spec.bullet.texture.startsWith('/') ? spec.bullet.texture : `/${spec.bullet.texture}`;
            scene.load.image(spec.bullet.texture, url);
        }
    }
}

// ─── Bullets ─────────────────────────────────────────────────────────────

export interface BulletRecord {
    body: MatterJS.BodyType;
    rect: Phaser.GameObjects.Shape | Phaser.GameObjects.Sprite | Phaser.GameObjects.Image;
    damage: number;
    color: number;
    originX: number;
    originY: number;
    maxDistance: number;
    rotationOffset?: number;
    isMelee?: boolean;
    trail: { x: number; y: number }[];
}

export interface ProjectileSpawnOptions {
    label: 'player-bullet' | 'monster-projectile';
    category: number;
    mask: number;
    speed: number;
    damage: number;
    size: { radius: number; width: number; height: number; color: number };
    texture?: string;
    scale?: number;
    color?: number;
    maxDistance?: number;
    rotationOffset?: number;
}

/**
 * Spawn a single projectile body + visual (Sprite if texture exists, rectangle fallback).
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
    const { radius, width, height, color: defaultColor } = opts.size;
    const bulletColor = opts.color ?? defaultColor;

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

    let visualObj: Phaser.GameObjects.Shape | Phaser.GameObjects.Sprite | Phaser.GameObjects.Image;

    if (opts.texture && scene.textures.exists(opts.texture)) {
        const sprite = scene.add.image(origin.x, origin.y, opts.texture);
        if (opts.scale) sprite.setScale(opts.scale);
        visualObj = sprite;
    } else {
        const rect = scene.add.rectangle(origin.x, origin.y, width, height, bulletColor);
        rect.setStrokeStyle(1, 0x14532d, 1);
        visualObj = rect;
    }

    const rotRad = ((opts.rotationOffset ?? 0) * Math.PI) / 180;
    visualObj.setRotation(Math.atan2(direction.y, direction.x) + rotRad);

    return {
        body,
        rect: visualObj,
        damage: opts.damage,
        color: bulletColor,
        originX: origin.x,
        originY: origin.y,
        maxDistance: opts.maxDistance ?? 800,
        rotationOffset: rotRad,
        trail: [],
    };
}

export interface MeleeSpawnOptions {
    origin: { x: number; y: number };
    angle: number;
    range: number;
    hitWidth: number;
    hitHeight: number;
    damage: number;
    texture?: string;
    scale?: number;
    rotationOffset?: number;
}

/**
 * Spawn a melee attack hitbox sensor + visual slash arc trajectory.
 */
export function spawnMeleeHitbox(
    scene: Phaser.Scene,
    matter: any,
    opts: MeleeSpawnOptions,
): BulletRecord {
    const dist = opts.range * 0.6;
    const hx = opts.origin.x + Math.cos(opts.angle) * dist;
    const hy = opts.origin.y + Math.sin(opts.angle) * dist;

    const body = matter.Bodies.rectangle(hx, hy, opts.hitWidth, opts.hitHeight, {
        isSensor: true,
        label: 'player-bullet',
        collisionFilter: {
            category: CAT.BULLET,
            mask: PROJECTILE_PLAYER_MASK,
        },
    });
    matter.Body.setAngle(body, opts.angle);
    scene.matter.world.add(body);

    let visualObj: Phaser.GameObjects.Shape | Phaser.GameObjects.Sprite | Phaser.GameObjects.Image;
    const scale = opts.scale ?? 0.18;
    const isLeft = Math.cos(opts.angle) < 0;

    // rotationOffset directly controls the texture's screen-space rotation,
    // matching ranged bullets (rotation = aim_angle + rotRad). The scaleX
    // mirror below handles the visual flip for left swings — no need for an
    // extra +π hardcoded flip or isLeft negation.
    const rotRad = ((opts.rotationOffset ?? 0) * Math.PI) / 180;
    const baseRotation = opts.angle + rotRad;

    if (opts.texture && scene.textures.exists(opts.texture)) {
        // Spawn slash arc at exact weapon Box blade tip (opts.origin) facing along the swing trajectory
        const sprite = scene.add.image(opts.origin.x, opts.origin.y, opts.texture);
        sprite.setOrigin(0.1, 0.5);

        const initScaleX = isLeft ? -scale : scale;
        const targetScaleX = isLeft ? -scale * 1.5 : scale * 1.5;

        sprite.setScale(initScaleX, scale);
        sprite.setRotation(baseRotation);
        sprite.setAlpha(1.0);
        // Tween only alpha + scale; rotation is static so rotationOffset
        // remains visible instead of being masked by a sweep animation.
        scene.tweens.add({
            targets: sprite,
            alpha: 0,
            scaleX: targetScaleX,
            scaleY: scale * 1.5,
            duration: 180,
            ease: 'Quad.out',
            onComplete: () => {
                sprite.destroy();
                scene.matter.world.remove(body);
            },
        });
        visualObj = sprite;
    } else {
        const rect = scene.add.rectangle(hx, hy, opts.hitWidth, opts.hitHeight, 0xc084fc, 0.7);
        rect.setRotation(baseRotation);
        scene.tweens.add({
            targets: rect,
            alpha: 0,
            duration: 180,
            onComplete: () => {
                rect.destroy();
                scene.matter.world.remove(body);
            },
        });
        visualObj = rect;
    }

    visualObj.setDepth(DEPTH.PROJECTILE_BASE + Math.round(hy) + 50);

    return {
        body,
        rect: visualObj,
        damage: opts.damage,
        color: 0xc084fc,
        originX: opts.origin.x,
        originY: opts.origin.y,
        maxDistance: opts.range,
        rotationOffset: rotRad,
        isMelee: true,
        trail: [],
    };
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
            graphics.lineStyle(3, b.color, alpha * 0.7);
            graphics.beginPath();
            graphics.moveTo(trail[k - 1].x, trail[k - 1].y);
            graphics.lineTo(trail[k].x, trail[k].y);
            graphics.strokePath();
        }
    }
}
