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
 */

import type * as Phaser from 'phaser';

const TRAIL_LENGTH = 6;
const INDICATOR_W = 36;
const INDICATOR_H = 4;
const INDICATOR_OFFSET_Y = -34; // above character center
const COMPLETED_FLASH_MS = 600;
const INDICATOR_LABEL_COLOR = '#bbf7d0';

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
    size?: { radius?: number; width?: number; height?: number; color?: number };
}

const DEFAULT_BULLET_COLOR = 0x22c55e;
const DEFAULT_BULLET_STROKE = 0x14532d;

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
    const radius = opts.size?.radius ?? 4;
    const width = opts.size?.width ?? 16;
    const height = opts.size?.height ?? 4;
    const color = opts.size?.color ?? DEFAULT_BULLET_COLOR;

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
    rect.setStrokeStyle(1, DEFAULT_BULLET_STROKE, 1);
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

// ─── Head reload indicator ───────────────────────────────────────────────

export interface WeaponIndicator {
    bg: Phaser.GameObjects.Graphics;
    fill: Phaser.GameObjects.Graphics;
    label: Phaser.GameObjects.Text;
}

export function createWeaponIndicator(scene: Phaser.Scene): WeaponIndicator {
    const bg = scene.add.graphics();
    const fill = scene.add.graphics();
    // Far above Z-order so it draws on top of bullets/walls/background.
    // Numbers are coarse; depth is the contract.
    bg.setDepth(1000);
    fill.setDepth(1001);
    const label = scene.add
        .text(0, 0, '', {
            fontFamily: 'monospace',
            fontSize: '10px',
            color: INDICATOR_LABEL_COLOR,
        })
        .setOrigin(0.5, 1)
        .setDepth(1002);
    return { bg, fill, label };
}

export function drawWeaponIndicator(
    indicator: WeaponIndicator,
    active: { reloading: boolean; reloadStartedAt: number; reloadTimeMs: number; justCompletedAt: number },
    time: number,
    bodyPos: { x: number; y: number },
    halfH: number,
): void {
    const { bg, fill, label } = indicator;
    bg.clear();
    fill.clear();
    label.setText('');

    const cx = bodyPos.x;
    const cy = bodyPos.y - halfH + INDICATOR_OFFSET_Y;
    const showReloading = active.reloading;
    const showCompleted = active.justCompletedAt > 0;

    if (showReloading || showCompleted) {
        bg.fillStyle(0x052e16, 0.85);
        bg.fillRect(cx - INDICATOR_W / 2, cy, INDICATOR_W, INDICATOR_H);
    }

    if (showReloading) {
        const elapsed = time - active.reloadStartedAt;
        const frac = Math.max(0, Math.min(1, elapsed / active.reloadTimeMs));
        fill.fillStyle(0xbbf7d0, 0.95);
        fill.fillRect(cx - INDICATOR_W / 2, cy, INDICATOR_W * frac, INDICATOR_H);
        label.setText('Reloading…');
        label.setPosition(cx, cy - 2);
    } else if (showCompleted) {
        const since = time - active.justCompletedAt;
        const alpha = 1 - since / COMPLETED_FLASH_MS;
        fill.fillStyle(0xbbf7d0, alpha);
        fill.fillRect(cx - INDICATOR_W / 2, cy, INDICATOR_W, INDICATOR_H);
        label.setText('Full');
        label.setPosition(cx, cy - 2);
        label.setAlpha(alpha);
    }
}

// ─── Trail renderer ─────────────────────────────────────────────────────

export interface BulletTrail {
    graphics: Phaser.GameObjects.Graphics;
    positions: { x: number; y: number }[];
}

/** Create the shared trail graphics (one for all bullets, drawn in -1 depth). */
export function createBulletTrail(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
    const g = scene.add.graphics();
    g.setDepth(-1);
    return g;
}

/** Push the current body position onto this bullet's trail and trim to max length. */
export function pushBulletTrail(bullet: BulletRecord, trail: BulletTrail): void {
    const p = bullet.body.position;
    trail.positions.push({ x: p.x, y: p.y });
    if (trail.positions.length > TRAIL_LENGTH) trail.positions.shift();
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