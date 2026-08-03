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
export function loadWeaponAssets(scene: Phaser.Scene, weaponSpecs: Iterable<WeaponSpec>): void {
    for (const spec of weaponSpecs) {
        if (spec.visual?.texture && !scene.textures.exists(spec.visual.texture)) {
            const url = spec.visual.texture.startsWith('/')
                ? spec.visual.texture
                : `/${spec.visual.texture}`;
            scene.load.image(spec.visual.texture, url);
        }
        if (spec.bullet?.texture && !scene.textures.exists(spec.bullet.texture)) {
            const url = spec.bullet.texture.startsWith('/')
                ? spec.bullet.texture
                : `/${spec.bullet.texture}`;
            scene.load.image(spec.bullet.texture, url);
        }
    }
}

// ─── Bullets ─────────────────────────────────────────────────────────────

export interface BulletRecord {
    body: MatterJS.BodyType;
    rect:
        | Phaser.GameObjects.Shape
        | Phaser.GameObjects.Sprite
        | Phaser.GameObjects.Image
        | Phaser.GameObjects.Graphics;
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
    anchor?: [number, number];
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
        if (opts.anchor) sprite.setOrigin(opts.anchor[0], opts.anchor[1]);
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
    /** Swing arc sweep in degrees. Used by the procedural arc visual
     *  when no `texture` is provided; defaults to 120 (the schema
     *  default for `visual.swingAngle`). */
    swingAngle?: number;
    feetY?: number;
    /** Matter category. Defaults to CAT.BULLET (player melee). */
    category?: number;
    /** Matter mask (who the hitbox collides with). Defaults to PROJECTILE_PLAYER_MASK. */
    mask?: number;
    /** Body label for collisionstart lookup. Defaults to 'player-bullet'. */
    label?: string;
}

/**
 * Spawn a melee attack hitbox sensor + visual slash arc trajectory.
 *
 * Defaults to player-side categories/labels so existing callers (player
 * melee) need no changes. Monsters pass `category: CAT.MONSTER_PROJECTILE`,
 * `mask: PROJECTILE_MONSTER_MASK`, and `label: 'monster-melee'` so the
 * MonsterController.bindCollisions handler can route hits to the player.
 */
export function spawnMeleeHitbox(
    scene: Phaser.Scene,
    matter: any,
    opts: MeleeSpawnOptions,
): BulletRecord {
    const scale = opts.scale ?? 0.18;
    const isLeft = Math.cos(opts.angle) < 0;

    // Position the hitbox so its far edge reaches `range` distance from
    // the origin. For a 30-wide hitbox at range=36, sideOffset = 36 - 15
    // = 21px from center → hitbox covers 6 to 36 px (player plasma-sword
    // sits comfortably inside). For monsters with a longer reach this
    // pushes the swing out to the full attack distance instead of
    // clipping to the body.
    const sideOffset = Math.max(0, opts.range - opts.hitWidth / 2);
    const hx = opts.origin.x + (isLeft ? -sideOffset : sideOffset);
    const hy = opts.origin.y;

    const body = matter.Bodies.rectangle(hx, hy, opts.hitWidth, opts.hitHeight, {
        isSensor: true,
        label: opts.label ?? 'player-bullet',
        collisionFilter: {
            category: opts.category ?? CAT.BULLET,
            mask: opts.mask ?? PROJECTILE_PLAYER_MASK,
        },
    });
    scene.matter.world.add(body);

    let visualObj:
        | Phaser.GameObjects.Shape
        | Phaser.GameObjects.Sprite
        | Phaser.GameObjects.Image
        | Phaser.GameObjects.Graphics;

    const rotOffsetRad = ((opts.rotationOffset ?? 0) * Math.PI) / 180;
    const visualRotation = isLeft ? -rotOffsetRad : rotOffsetRad;

    if (opts.texture && scene.textures.exists(opts.texture)) {
        // Spawn full circle / melee graphic centered directly at character left/right
        const sprite = scene.add.image(hx, hy, opts.texture);
        sprite.setOrigin(0.5, 0.5);
        // Dynamic depth: Calculate character feetY + 5 so it rests BETWEEN character sprite (feetY) and handheld weapon (feetY + 10)
        const feetY = opts.feetY ?? opts.origin.y + 32;
        const effectDepth = Math.round(feetY) + 5;
        sprite.setDepth(effectDepth);
        sprite.setFlipX(isLeft);
        sprite.setScale(scale, scale);
        sprite.setRotation(visualRotation);
        sprite.setAlpha(1.0);

        scene.tweens.add({
            targets: sprite,
            alpha: 0,
            scaleX: scale * 1.35,
            scaleY: scale * 1.35,
            duration: 200,
            ease: 'Cubic.out',
            onComplete: () => {
                sprite.destroy();
                scene.matter.world.remove(body);
            },
        });
        visualObj = sprite;
    } else {
        // Procedural arc visual — translucent ripple made of three
        // concentric rings + a dashed outer trace whose alpha follows a
        // sine wave along the swing. No solid fill, so the silhouette of
        // the attacker stays visible through the arc and the effect
        // reads as a moving wave instead of a static purple wedge.
        const swingAngleDeg = opts.swingAngle ?? 120;
        const halfRad = ((swingAngleDeg / 2) * Math.PI) / 180;
        const innerR = Math.max(0, opts.range - opts.hitWidth);
        const outerR = opts.range;
        const arcColor = 0xc084fc;

        const g = scene.add.graphics();
        g.setPosition(opts.origin.x, opts.origin.y);
        g.setRotation(opts.angle);

        // Inner ring (closest to attacker, faintest).
        if (innerR > 4) {
            g.lineStyle(1, arcColor, 0.2);
            g.beginPath();
            g.arc(0, 0, innerR, -halfRad, halfRad, false);
            g.strokePath();
        }

        // Mid ring — half-strength.
        const midR = (innerR + outerR) / 2;
        g.lineStyle(1, arcColor, 0.4);
        g.beginPath();
        g.arc(0, 0, midR, -halfRad, halfRad, false);
        g.strokePath();

        // Outer rim — dashed segments whose alpha follows a sine wave
        // across the sweep. The peak/trough alternation gives the slash
        // edge a pulsing, fluctuating feel as it travels through space.
        const segments = 18;
        const segSweep = (halfRad * 2) / segments;
        for (let i = 0; i < segments; i++) {
            const t = i / segments;
            const alpha = 0.25 + 0.65 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2));
            g.lineStyle(2, arcColor, alpha);
            g.beginPath();
            g.arc(
                0,
                0,
                outerR,
                -halfRad + i * segSweep,
                -halfRad + (i + 0.45) * segSweep,
                false,
            );
            g.strokePath();
        }

        const feetY = opts.feetY ?? opts.origin.y + 32;
        const effectDepth = Math.round(feetY) + 5;
        g.setDepth(effectDepth);

        scene.tweens.add({
            targets: g,
            alpha: 0,
            scaleX: 1.2,
            scaleY: 1.2,
            duration: 200,
            ease: 'Cubic.out',
            onComplete: () => {
                g.destroy();
                scene.matter.world.remove(body);
            },
        });
        visualObj = g;
    }

    return {
        body,
        rect: visualObj,
        damage: opts.damage,
        color: 0xc084fc,
        originX: opts.origin.x,
        originY: opts.origin.y,
        maxDistance: opts.range,
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
export function bulletVelocity(angle: number, speed: number): { x: number; y: number } {
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
