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

import { SFX_EVENT } from '@/lib/constants';
import { EventBus } from '@/lib/events/bus';
import type { WeaponSpec } from '@/lib/weapons';

import {
    bulletVelocity,
    createBulletTrail,
    destroyBulletVisual,
    pushBulletTrail,
    renderBulletTrails,
    spawnProjectile,
    type BulletRecord,
} from './weapon';

import {
    CAT,
    DEPTH,
    PROJECTILE_PLAYER_MASK,
} from '@/lib/constants';

// ─── Pure helpers ────────────────────────────────────────────────────────

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

export class WeaponController {
    private readonly scene: Phaser.Scene;
    private readonly body: MatterJS.BodyType;
    private readonly matter: any;
    private readonly slots: SlotState[];
    private currentIndex = 0;
    private readonly bullets: BulletRecord[] = [];
    private readonly trailGraphics: Phaser.GameObjects.Graphics;

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
        this.slots = weapons.map((spec) => {
            const clipSize = spec.clipSize ?? 1;
            return {
                spec,
                ammo: clipSize,
                lastFireAt: 0,
                reloading: false,
                reloadStartedAt: 0,
                justCompletedAt: 0,
            };
        });

        this.trailGraphics = createBulletTrail(scene);

        // Bullets die on contact with tall walls (WALL_TALL) or monsters.
        // Short walls (WALL_SHORT) and player character hitboxes are explicitly ignored.
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
                const other = pair.bodyA === bulletBody ? pair.bodyB : pair.bodyA;
                if (!other) continue;

                const category = other.collisionFilter?.category ?? 0;
                const isTallWall = (category & CAT.WALL_TALL) !== 0;
                const isMonster = (category & CAT.MONSTER_MELEE) !== 0 || other.label === 'monster';

                if (isTallWall) {
                    for (let i = this.bullets.length - 1; i >= 0; i--) {
                        if (this.bullets[i].body === bulletBody) {
                            this.destroyBullet(i);
                            EventBus.emit(SFX_EVENT('bullet-wall'));
                            break;
                        }
                    }
                } else if (isMonster) {
                    for (let i = this.bullets.length - 1; i >= 0; i--) {
                        if (this.bullets[i].body === bulletBody) {
                            this.destroyBullet(i);
                            break;
                        }
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
        EventBus.emit(SFX_EVENT('weapon-switch'));
    }

    /** R key — manual reload. Only when ammo < clipSize and not already reloading. */
    manualReload(): void {
        const slot = this.slots[this.currentIndex];
        if (slot.reloading) return;
        const clipSize = slot.spec.clipSize ?? 1;
        if (slot.ammo >= clipSize) return;
        slot.reloading = true;
        slot.reloadStartedAt = this.scene.time.now;
        EventBus.emit(SFX_EVENT('reload-start'));
    }

    /** Drop ammo into the current slot — caps at clipSize. */
    refillActiveAmmo(fraction: number): void {
        const slot = this.slots[this.currentIndex];
        const clipSize = slot.spec.clipSize ?? 1;
        const add = Math.round(clipSize * fraction);
        slot.ammo = Math.min(clipSize, slot.ammo + add);
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

    /** Full slot state (reloading flag + timestamps) for the active weapon. */
    getActiveSlotState(): {
        reloading: boolean;
        reloadStartedAt: number;
        reloadTimeMs: number;
        justCompletedAt: number;
    } {
        const s = this.slots[this.currentIndex];
        return {
            reloading: s.reloading,
            reloadStartedAt: s.reloadStartedAt,
            reloadTimeMs: s.spec.reloadTimeMs ?? 0,
            justCompletedAt: s.justCompletedAt,
        };
    }

    getAmmo(): number {
        return this.slots[this.currentIndex].ammo;
    }

    getMaxAmmo(): number {
        return this.slots[this.currentIndex].spec.clipSize ?? 1;
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
        const reloadTimeMs = s.spec.reloadTimeMs ?? 0;
        if (reloadTimeMs === 0) return 0;
        const elapsed = time - s.reloadStartedAt;
        return Math.max(0, Math.min(1, elapsed / reloadTimeMs));
    }

    /**
     * Per-frame: tick reload, spawn bullets on fire, sync visuals.
     */
    update(time: number, tx: number, ty: number, fire: boolean, _halfH: number): void {
        // 1. Reload tick — every slot ticks independently.
        for (let i = 0; i < this.slots.length; i++) {
            const slot = this.slots[i];
            const reloadTimeMs = slot.spec.reloadTimeMs ?? 0;
            if (slot.reloading && reloadTimeMs > 0) {
                const elapsed = time - slot.reloadStartedAt;
                if (elapsed >= reloadTimeMs) {
                    slot.ammo = slot.spec.clipSize ?? 1;
                    slot.reloading = false;
                    slot.justCompletedAt = time;
                    EventBus.emit(SFX_EVENT('reload-finish'));
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
            EventBus.emit(SFX_EVENT('reload-start'));
        }

        // 3. Fire — gated by reload state and ammo.
        if (fire && !active.reloading && active.ammo > 0) {
            if (time - active.lastFireAt >= active.spec.cooldownMs) {
                this.fire(tx, ty);
                active.lastFireAt = time;
            }
        } else if (fire && !active.reloading && active.ammo === 0) {
            // Dry-fire click on empty clip — once per fire-press. Tracks
            // the rising edge of `fire` via lastFireAt so we don't spam.
            if (time - active.lastFireAt >= 80) {
                EventBus.emit(SFX_EVENT('dry-fire'));
                active.lastFireAt = time;
            }
        }

        // 4. Sync bullet visuals + record trail.
        renderBulletTrails(this.trailGraphics, this.bullets);
        for (const b of this.bullets) {
            const bp = b.body.position;
            b.rect.setPosition(bp.x, bp.y);
            b.rect.setDepth(DEPTH.PROJECTILE_BASE + Math.round(bp.y));
            b.rect.setRotation(Math.atan2(b.body.velocity.y, b.body.velocity.x));
            pushBulletTrail(b, { graphics: this.trailGraphics, positions: b.trail });
        }

        // 5. Head indicator is drawn by StatusHud — character.ts wires it
        // and reads the slot state via WeaponController's getters.
    }

    destroy(): void {
        this.trailGraphics.destroy();
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

        const n = slot.spec.bulletsPerShot ?? 1;
        const projectile = slot.spec.projectile;
        if (!projectile) return; // melee-only weapons don't fire
        const { speed, visual: size } = projectile;
        EventBus.emit(SFX_EVENT('player-shoot'));
        // Spread only when n > 1 (shotgun-style). Single-shot weapons fire straight.
        const spreadDeg = n > 1 ? 16 : 0;
        for (let i = 0; i < n; i++) {
            const t = n === 1 ? 0 : (i - (n - 1) / 2) * (spreadDeg / Math.max(1, n - 1));
            const a = angle + (t * Math.PI) / 180;
            const v = bulletVelocity(a, speed);
            const bullet = spawnProjectile(
                this.scene,
                this.matter,
                { x: origin.x, y: origin.y },
                { x: v.x, y: v.y },
                {
                    label: 'player-bullet',
                    category: CAT.BULLET,
                    mask: PROJECTILE_PLAYER_MASK,
                    speed,
                    damage: slot.spec.damage,
                    size,
                },
            );
            this.bullets.push(bullet);
        }

        slot.ammo = Math.max(0, slot.ammo - 1);
    }

    private destroyBullet(idx: number): void {
        const b = this.bullets[idx];
        destroyBulletVisual(this.scene, b);
        this.bullets.splice(idx, 1);
    }
}