/**
 * src/game/weapons/logic.ts
 * --------------------------------------------------------------------------
 * Weapon module's controller + pure helpers.
 *
 *   - WeaponController: hotbar state, fire cadence, manual/auto reload,
 *     per-frame tick. Owns the bullet pool. Delegates all visual
 *     creation/update to helpers in `./weapon.ts`.
 *   - wall-policy constants + body-label helpers shared with the monster
 *     projectile factory.
 *
 * No runtime Phaser import — Phaser types only, scenes are passed in. This
 * keeps Node tests free from `window is not defined` errors.
 */

import type * as Phaser from 'phaser';

import type { WeaponSpec } from '@/lib/weapons';

import {
    BulletTrail,
    bulletVelocity,
    createBulletTrail,
    createWeaponIndicator,
    destroyBulletVisual,
    drawWeaponIndicator,
    pushBulletTrail,
    renderBulletTrails,
    spawnBulletVisual,
    type BulletVisual,
    type WeaponIndicator,
} from './weapon';

// ─── Pure helpers ────────────────────────────────────────────────────────

/** Player bullets collide with everything; walls decide whether to fire. */
export const PLAYER_BULLET_MASK = 0xffff;

/**
 * Mask for ranged-monster projectiles — CHARACTER (player) + WALL_TALL
 * only. Symmetric to player bullets: tall walls block, short walls don't.
 */
export const MONSTER_PROJECTILE_MASK = (1 /* WALL_TALL */) | (1 << 2 /* CHARACTER */);

/** Whether a body label identifies a player-fired bullet. */
export function isPlayerBullet(body: { label?: string }): boolean {
    return body.label === 'player-bullet';
}

/** Whether a body label identifies a wall (any kind). */
export function isWall(body: { label?: string }): boolean {
    return typeof body.label === 'string' && body.label.startsWith('wall:');
}

// ─── Controller ──────────────────────────────────────────────────────────

interface SlotState {
    spec: WeaponSpec;
    ammo: number;
    lastFireAt: number;
    reloading: boolean;
    reloadStartedAt: number;
    justCompletedAt: number; // >0 while "Full" is fading out
}

interface BulletRecord extends BulletVisual {
    trail: BulletTrail['positions'];
}

export class WeaponController {
    private readonly scene: Phaser.Scene;
    private readonly body: MatterJS.BodyType;
    private readonly matter: any;
    private readonly slots: SlotState[];
    private currentIndex = 0;
    private readonly bullets: BulletRecord[] = [];
    private readonly trailGraphics: Phaser.GameObjects.Graphics;
    private readonly indicator: WeaponIndicator;

    constructor(
        scene: Phaser.Scene,
        matter: any,
        body: MatterJS.BodyType,
        weapons: WeaponSpec[],
    ) {
        if (weapons.length === 0) throw new Error('WeaponController: at least one weapon required');
        this.scene = scene;
        this.matter = matter;
        this.body = body;
        this.slots = weapons.map((spec) => ({
            spec,
            ammo: spec.clipSize,
            lastFireAt: 0,
            reloading: false,
            reloadStartedAt: 0,
            justCompletedAt: 0,
        }));

        this.trailGraphics = createBulletTrail(scene);
        this.indicator = createWeaponIndicator(scene);

        // Bullets die on contact with any wall (WALL_TALL or WALL_SHORT).
        scene.matter.world.on('collisionstart', (event: any) => {
            const pairs = event.pairs || [];
            for (const pair of pairs) {
                const bulletBody =
                    pair.bodyA?.label === 'player-bullet'
                        ? pair.bodyA
                        : pair.bodyB?.label === 'player-bullet'
                          ? pair.bodyB
                          : null;
                if (!bulletBody) continue;
                for (let i = this.bullets.length - 1; i >= 0; i--) {
                    if (this.bullets[i].body === bulletBody) {
                        this.destroyBullet(i);
                        break;
                    }
                }
            }
        });
    }

    /** 1/2/3 — switch active slot. Cancels any in-progress reload. */
    switchTo(index: number): void {
        if (index < 0 || index >= this.slots.length) return;
        if (index === this.currentIndex) return;
        const slot = this.slots[this.currentIndex];
        slot.reloading = false;
        slot.justCompletedAt = 0;
        this.currentIndex = index;
    }

    /** R key — manual reload. Only when ammo < clipSize and not already reloading. */
    manualReload(): void {
        const slot = this.slots[this.currentIndex];
        if (slot.reloading) return;
        if (slot.ammo >= slot.spec.clipSize) return;
        slot.reloading = true;
        slot.reloadStartedAt = this.scene.time.now;
    }

    /** Drop ammo into the current slot — caps at clipSize. */
    refillActiveAmmo(fraction: number): void {
        const slot = this.slots[this.currentIndex];
        const add = Math.round(slot.spec.clipSize * fraction);
        slot.ammo = Math.min(slot.spec.clipSize, slot.ammo + add);
    }

    /** Switch to a named weapon if it's already in the hotbar. */
    swapToWeapon(weaponId: string): boolean {
        const idx = this.slots.findIndex((s) => s.spec.id === weaponId);
        if (idx < 0) return false;
        this.switchTo(idx);
        return true;
    }

    getActive(): WeaponSpec {
        return this.slots[this.currentIndex].spec;
    }

    getAmmo(): number {
        return this.slots[this.currentIndex].ammo;
    }

    getMaxAmmo(): number {
        return this.slots[this.currentIndex].spec.clipSize;
    }

    getActiveIndex(): number {
        return this.currentIndex;
    }

    getSlotCount(): number {
        return this.slots.length;
    }

    getSlot(index: number): { spec: WeaponSpec; ammo: number } {
        const s = this.slots[index];
        return { spec: s.spec, ammo: s.ammo };
    }

    isReloading(): boolean {
        return this.slots[this.currentIndex].reloading;
    }

    getReloadProgress(time: number): number {
        const s = this.slots[this.currentIndex];
        if (!s.reloading) return 0;
        const elapsed = time - s.reloadStartedAt;
        return Math.max(0, Math.min(1, elapsed / s.spec.reloadTimeMs));
    }

    /**
     * Per-frame: tick reload, spawn bullets on fire, sync visuals.
     */
    update(time: number, tx: number, ty: number, fire: boolean, halfH: number): void {
        // 1. Reload tick — every slot ticks independently.
        for (let i = 0; i < this.slots.length; i++) {
            const slot = this.slots[i];
            if (slot.reloading) {
                const elapsed = time - slot.reloadStartedAt;
                if (elapsed >= slot.spec.reloadTimeMs) {
                    slot.ammo = slot.spec.clipSize;
                    slot.reloading = false;
                    slot.justCompletedAt = time;
                }
            }
            if (slot.justCompletedAt > 0) {
                const since = time - slot.justCompletedAt;
                if (since >= 600) {
                    slot.justCompletedAt = 0;
                }
            }
        }

        // 2. Auto-reload on empty.
        const active = this.slots[this.currentIndex];
        if (active.ammo === 0 && !active.reloading && active.justCompletedAt === 0) {
            active.reloading = true;
            active.reloadStartedAt = time;
        }

        // 3. Fire — gated by reload state and ammo.
        if (fire && !active.reloading && active.ammo > 0) {
            if (time - active.lastFireAt >= active.spec.fireIntervalMs) {
                this.fire(tx, ty);
                active.lastFireAt = time;
            }
        }

        // 4. Sync bullet visuals + record trail.
        renderBulletTrails(this.trailGraphics, this.bullets);
        for (const b of this.bullets) {
            const bp = b.body.position;
            b.rect.setPosition(bp.x, bp.y);
            b.rect.setRotation(Math.atan2(b.body.velocity.y, b.body.velocity.x));
            pushBulletTrail(b, { graphics: this.trailGraphics, positions: b.trail });
        }

        // 5. Head indicator.
        drawWeaponIndicator(
            this.indicator,
            {
                reloading: active.reloading,
                reloadStartedAt: active.reloadStartedAt,
                reloadTimeMs: active.spec.reloadTimeMs,
                justCompletedAt: active.justCompletedAt,
            },
            time,
            this.body.position,
            halfH,
        );
    }

    destroy(): void {
        this.trailGraphics.destroy();
        this.indicator.bg.destroy();
        this.indicator.fill.destroy();
        this.indicator.label.destroy();
        for (const b of this.bullets) {
            destroyBulletVisual(this.scene, b);
        }
        this.bullets.length = 0;
    }

    // ─── internals ─────────────────────────────────────────────────────────

    private fire(tx: number, ty: number): void {
        const slot = this.slots[this.currentIndex];
        const origin = this.body.position;
        const dx = tx - origin.x;
        const dy = ty - origin.y;
        const len = Math.hypot(dx, dy);
        if (len === 0) return;
        const angle = Math.atan2(dy, dx);

        const n = slot.spec.bulletsPerShot;
        // Spread only when n > 1 (shotgun-style). Single-shot weapons fire straight.
        const spreadDeg = n > 1 ? 16 : 0;
        for (let i = 0; i < n; i++) {
            const t = n === 1 ? 0 : (i - (n - 1) / 2) * (spreadDeg / Math.max(1, n - 1));
            const a = angle + (t * Math.PI) / 180;
            const visual = spawnBulletVisual(this.scene, origin.x, origin.y, a);
            const v = bulletVelocity(a, slot.spec.bullet.speed);
            this.matter.Body.setVelocity(visual.body, { x: v.x, y: v.y });
            this.bullets.push({ ...visual, trail: [] });
        }

        slot.ammo = Math.max(0, slot.ammo - 1);
    }

    private destroyBullet(idx: number): void {
        const b = this.bullets[idx];
        destroyBulletVisual(this.scene, b);
        this.bullets.splice(idx, 1);
    }
}