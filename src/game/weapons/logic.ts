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
    spawnMeleeHitbox,
    spawnProjectile,
    type BulletRecord,
} from './weapon';
import { WeaponVisualController } from './visual';

import { useGameStore } from '@/store/game-store';

import { CAT, DEPTH, PROJECTILE_PLAYER_MASK } from '@/lib/constants';

// ─── Pure helpers ────────────────────────────────────────────────────────

/** Whether a body label identifies a player-fired bullet. */
export function isPlayerBullet(body: { label?: string }): boolean {
    return body.label === 'player-bullet';
}

/**
 * Wrap-around slot index. `direction` is `+1` (next) or `-1` (previous);
 * any integer is accepted since the wrap formula only depends on sign.
 * Single-slot hotbar returns 0. Pure so controllers / TouchControls can
 * share the same cycle math.
 */
export function nextSlotIndex(currentIndex: number, direction: 1 | -1, slotCount: number): number {
    if (slotCount <= 0) return 0;
    const len = Math.floor(slotCount);
    const idx = (((Math.floor(currentIndex) + direction) % len) + len) % len;
    return idx;
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
    /** Cap on slot count, read from CharacterSpec.weaponMax at
     *  construction. New pickups past this cap are refused so the
     *  tavern's replace-HUD can take over. */
    private readonly maxSlots: number;
    private readonly bullets: BulletRecord[] = [];
    private readonly trailGraphics: Phaser.GameObjects.Graphics;
    private readonly visualController: WeaponVisualController;

    constructor(
        scene: Phaser.Scene,
        matter: any,
        body: MatterJS.BodyType,
        weapons: WeaponSpec[],
        maxSlots: number = 3,
    ) {
        this.scene = scene;
        this.matter = matter;
        this.body = body;
        this.maxSlots = Math.max(1, Math.floor(maxSlots));
        const savedActiveIdx = useGameStore.getState().activeWeaponIndex ?? 0;
        const savedSlots = useGameStore.getState().slots;

        this.currentIndex =
            savedActiveIdx >= 0 && savedActiveIdx < weapons.length ? savedActiveIdx : 0;

        this.slots = weapons.map((spec, idx) => {
            const clipSize = spec.clipSize ?? 1;
            const savedSlot = savedSlots?.find((s) => s.id === spec.id) ?? savedSlots?.[idx];
            return {
                spec,
                ammo: savedSlot && typeof savedSlot.ammo === 'number' ? Math.min(savedSlot.ammo, clipSize) : clipSize,
                lastFireAt: 0,
                reloading: false,
                reloadStartedAt: 0,
                justCompletedAt: 0,
            };
        });

        this.trailGraphics = createBulletTrail(scene);
        this.visualController = new WeaponVisualController(scene);
        if (this.slots.length > 0) {
            this.visualController.setWeapon(this.slots[this.currentIndex].spec);
        }

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

                const category = (other as any).collisionFilter?.category ?? 0;
                const isTallWall = (category & CAT.WALL_TALL) !== 0;
                const isMonster = (category & CAT.MONSTER_MELEE) !== 0 || other.label === 'monster';

                if (isTallWall) {
                    // Find the slot whose bullet hit, so the per-weapon
                    // sfx.bulletWall override applies.
                    const ownerIndex = this.bullets.findIndex((b) => b.body === bulletBody);
                    const ownerSpec =
                        ownerIndex >= 0 ? this.slots[this.currentIndex].spec : undefined;
                    for (let i = this.bullets.length - 1; i >= 0; i--) {
                        if (this.bullets[i].body === bulletBody) {
                            this.destroyBullet(i);
                            const sfx = ownerSpec?.sfx?.bulletWall ?? 'bullet-wall';
                            EventBus.emit(SFX_EVENT(sfx), {
                                key: ownerSpec?.id ? `weapon:${ownerSpec.id}` : sfx,
                                throttleMs: ownerSpec?.sfx?.throttleMs,
                            });
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
        if (this.slots.length === 0) return;
        if (index < 0 || index >= this.slots.length) return;
        if (index === this.currentIndex) return;
        const slot = this.slots[this.currentIndex];
        slot.reloading = false;
        slot.justCompletedAt = 0;
        this.currentIndex = index;
        this.visualController.setWeapon(this.slots[index].spec);
        EventBus.emit(SFX_EVENT('weapon-switch'));
    }

    /** Mobile ◀/▶ button handler — cycle to the previous or next slot,
     *  wrapping around. Delegates to `nextSlotIndex` so the wrap math
     *  is shared with the node-runnable tests. */
    cycleSlot(direction: 1 | -1): void {
        if (this.slots.length === 0) return;
        const next = nextSlotIndex(this.currentIndex, direction, this.slots.length);
        this.switchTo(next);
    }

    /** R key — manual reload. Only when ammo < clipSize and not already reloading. */
    manualReload(): void {
        if (this.slots.length === 0) return;
        const slot = this.slots[this.currentIndex];
        const isMelee = slot.spec.bullet?.type === 'melee' || slot.spec.hitWidth !== undefined;
        if (isMelee || slot.reloading) return;
        const clipSize = slot.spec.clipSize ?? 1;
        if (slot.ammo >= clipSize) return;
        slot.reloading = true;
        slot.reloadStartedAt = this.scene.time.now;
        EventBus.emit(SFX_EVENT(slot.spec.sfx?.reloadStart ?? 'reload-start'));
    }

    /** Drop ammo into the current slot — caps at clipSize. */
    refillActiveAmmo(fraction: number): void {
        if (this.slots.length === 0) return;
        const slot = this.slots[this.currentIndex];
        const clipSize = slot.spec.clipSize ?? 1;
        const add = Math.round(clipSize * fraction);
        slot.ammo = Math.min(clipSize, slot.ammo + add);
    }

    /** Switch to a named weapon if it's already in the hotbar. */
    swapToWeapon(weaponId: string): boolean {
        if (this.slots.length === 0) return false;
        const idx = this.slots.findIndex((s) => s.spec.id === weaponId);
        if (idx < 0) return false;
        this.switchTo(idx);
        return true;
    }

    /**
     * Try to add a weapon to the next empty slot. Returns
     * `'added'` on success (the new weapon becomes active), or
     * `'capped'` when the hotbar already holds `maxSlots` weapons.
     *
     * Used by the tavern pickup flow: below the cap the drop is
     * auto-consumed; at the cap the caller auto-swaps the active
     * slot (see `src/game/scenes/scene.ts`).
     */
    tryPickupWeapon(spec: WeaponSpec): 'added' | 'capped' {
        if (this.slots.length >= this.maxSlots) return 'capped';
        const clipSize = spec.clipSize ?? 1;
        this.slots.push({
            spec,
            ammo: clipSize,
            lastFireAt: 0,
            reloading: false,
            reloadStartedAt: 0,
            justCompletedAt: 0,
        });
        // Bypass switchTo's "same index → skip" guard: when
        // transitioning from 0 slots → 1 slot, currentIndex is
        // still the default 0, so switchTo(0) would early-return
        // and never update the in-hand visual. Manually drive the
        // visual here so the first pickup actually appears in the
        // character's hand.
        this.currentIndex = this.slots.length - 1;
        this.visualController.setWeapon(spec);
        EventBus.emit(SFX_EVENT('weapon-switch'));
        return 'added';
    }

    /**
     * Replace the weapon in `slotIndex` with `spec`. No-op when the
     * index is out of range or when there are no slots at all.
     * Switches the active slot to the replaced one. Ammo resets to
     * clipSize for the new weapon.
     */
    replaceSlot(slotIndex: number, spec: WeaponSpec): void {
        if (this.slots.length === 0) return;
        if (slotIndex < 0 || slotIndex >= this.slots.length) return;
        const clipSize = spec.clipSize ?? 1;
        this.slots[slotIndex] = {
            spec,
            ammo: clipSize,
            lastFireAt: 0,
            reloading: false,
            reloadStartedAt: 0,
            justCompletedAt: 0,
        };
        // Bypass switchTo's "same index → skip" guard when the
        // replaced slot IS the active slot — the in-hand visual has
        // to update to the new weapon or the player sees the old one.
        if (slotIndex === this.currentIndex) {
            this.visualController.setWeapon(spec);
            EventBus.emit(SFX_EVENT('weapon-switch'));
        } else {
            this.switchTo(slotIndex);
        }
    }

    getActive(): WeaponSpec | null {
        return this.slots.length === 0 ? null : this.slots[this.currentIndex].spec;
    }

    /** Full slot state (reloading flag + timestamps) for the active weapon. */
    getActiveSlotState(): {
        reloading: boolean;
        reloadStartedAt: number;
        reloadTimeMs: number;
        justCompletedAt: number;
    } {
        if (this.slots.length === 0) {
            return { reloading: false, reloadStartedAt: 0, reloadTimeMs: 0, justCompletedAt: 0 };
        }
        const s = this.slots[this.currentIndex];
        return {
            reloading: s.reloading,
            reloadStartedAt: s.reloadStartedAt,
            reloadTimeMs: s.spec.reloadTimeMs ?? 0,
            justCompletedAt: s.justCompletedAt,
        };
    }

    getAmmo(): number {
        if (this.slots.length === 0) return 0;
        const slot = this.slots[this.currentIndex];
        const isMelee = slot.spec.bullet?.type === 'melee' || slot.spec.hitWidth !== undefined;
        return isMelee ? 1 : slot.ammo;
    }

    getMaxAmmo(): number {
        if (this.slots.length === 0) return 0;
        const slot = this.slots[this.currentIndex];
        const isMelee = slot.spec.bullet?.type === 'melee' || slot.spec.hitWidth !== undefined;
        return isMelee ? 1 : (slot.spec.clipSize ?? 1);
    }

    getActiveIndex(): number {
        return this.currentIndex;
    }

    getSlotCount(): number {
        return this.slots.length;
    }

    /** Maximum number of weapon slots this character may hold (from
     *  `CharacterSpec.weaponMax`). Equals `getSlotCount()` when full. */
    getMaxSlots(): number {
        return this.maxSlots;
    }

    /** True when the hotbar still has room for at least one more weapon. */
    hasEmptySlot(): boolean {
        return this.slots.length < this.maxSlots;
    }

    getSlot(index: number): { spec: WeaponSpec; ammo: number } | null {
        if (index < 0 || index >= this.slots.length) return null;
        const s = this.slots[index];
        const isMelee = s.spec.bullet?.type === 'melee' || s.spec.hitWidth !== undefined;
        return { spec: s.spec, ammo: isMelee ? 1 : s.ammo };
    }

    isReloading(): boolean {
        if (this.slots.length === 0) return false;
        const slot = this.slots[this.currentIndex];
        const isMelee = slot.spec.bullet?.type === 'melee' || slot.spec.hitWidth !== undefined;
        return isMelee ? false : slot.reloading;
    }

    getReloadProgress(time: number): number {
        if (this.slots.length === 0) return 0;
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
    private lastHalfH = 16;
    private lastFootY: number | undefined = undefined;

    /**
     * Per-frame: tick reload, spawn bullets on fire, sync visuals.
     *
     * @param footY Owner's foot-Y (world coords) — drives Y-sort depth
     *  for both the held weapon sprite and in-flight bullets so the
     *  player's projectiles interleave correctly with monsters (and any
     *  other Y-sorted entities). When omitted, falls back to flat
     *  `DEPTH.BULLET` / `DEPTH.WEAPON` so non-character callers (tests,
     *  scene plumbing) keep their old behaviour.
     */
    update(
        time: number,
        tx: number,
        ty: number,
        fire: boolean,
        halfH: number,
        footY?: number,
    ): void {
        this.lastHalfH = halfH;
        this.lastFootY = footY;
        // Empty hotbar (tavern phase 2 / post-spawn with no weapons yet):
        // skip reload, fire, and auto-reload logic. The visual controller
        // and bullet trail still update so already-in-flight bullets
        // continue to render after a player switches characters and the
        // hotbar resets to empty.
        if (this.slots.length > 0) {
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
                        EventBus.emit(SFX_EVENT(slot.spec.sfx?.reloadFinish ?? 'reload-finish'));
                    }
                }
                if (slot.justCompletedAt > 0) {
                    const since = time - slot.justCompletedAt;
                    if (since >= 600) {
                        slot.justCompletedAt = 0;
                    }
                }
            }

            // 2. Auto-reload on empty (ranged only).
            const active = this.slots[this.currentIndex];
            const isActiveMelee =
                active.spec.bullet?.type === 'melee' || active.spec.hitWidth !== undefined;
            if (isActiveMelee) {
                active.ammo = 1;
                active.reloading = false;
            } else if (active.ammo === 0 && !active.reloading && active.justCompletedAt === 0) {
                active.reloading = true;
                active.reloadStartedAt = time;
                EventBus.emit(SFX_EVENT(active.spec.sfx?.reloadStart ?? 'reload-start'));
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
                    EventBus.emit(SFX_EVENT(active.spec.sfx?.dryFire ?? 'dry-fire'));
                    active.lastFireAt = time;
                }
            }
        }

        // 4. Sync weapon attachment visual at character upper body / hand position
        const origin = this.body.position;
        const handX = origin.x;
        const handY = origin.y - halfH; // Align weapon to character hitbox center (chest/hands)      
        const dx = tx - handX;
        const dy = ty - handY;
        const aimAngle = Math.atan2(dy, dx);
        // Y-sort: weapon rides with owner's footY so player and monsters
        // interleave by actual screen-Y. Falls back to flat DEPTH.WEAPON
        // when no footY was supplied (e.g. tests / off-character callers).
        const weaponDepth = this.lastFootY !== undefined ? this.lastFootY + 20 : DEPTH.WEAPON;
        this.visualController.update(handX, handY, aimAngle, weaponDepth);

        // 5. Sync bullet visuals + record trail + destroy stopped/expired bullets.
        renderBulletTrails(this.trailGraphics, this.bullets);
        const bulletDepth = this.lastFootY !== undefined ? this.lastFootY + 10 : DEPTH.BULLET;
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            const bp = b.body.position;
            const vel = b.body.velocity;
            const currentSpeed = Math.hypot(vel.x, vel.y);
            const distSq = (bp.x - b.originX) ** 2 + (bp.y - b.originY) ** 2;

            // Cleanup ranged bullets that stopped moving (speed < 1.0) or traveled past max range
            if (!b.isMelee && (currentSpeed < 1.0 || distSq >= b.maxDistance ** 2)) {
                this.destroyBullet(i);
                continue;
            }

            b.rect.setPosition(bp.x, bp.y);
            b.rect.setDepth(bulletDepth);
            b.rect.setRotation(Math.atan2(vel.y, vel.x) + (b.rotationOffset ?? 0));
            pushBulletTrail(b, { graphics: this.trailGraphics, positions: b.trail });
        }

        // 6. Head indicator is drawn by StatusHud — character.ts wires it
        // and reads the slot state via WeaponController's getters.
    }

    destroy(): void {
        this.trailGraphics.destroy();
        this.visualController.destroy();
        for (const b of this.bullets) {
            destroyBulletVisual(this.scene, b);
        }
        this.bullets.length = 0;
    }

    // ─── internals ─────────────────────────────────────────────────────────

    private fire(tx: number, ty: number): void {
        const slot = this.slots[this.currentIndex];
        const origin = this.body.position;
        const handX = origin.x;
        const handY = origin.y - this.lastHalfH;
        const dx = tx - handX;
        const dy = ty - handY;
        const len = Math.hypot(dx, dy);
        if (len === 0) return;
        const angle = Math.atan2(dy, dx);

        // Trigger procedural animation for active weapon (Recoil for guns, Swing for melee)
        const attackType = slot.spec.bullet?.type;
        const isMelee = attackType === 'melee' || slot.spec.hitWidth !== undefined;

        if (isMelee) {
            this.visualController.triggerSwing();
            EventBus.emit(SFX_EVENT(slot.spec.sfx?.shoot ?? 'player-shoot'));

            // Center melee slash arc / hitbox at character hand position (not offset to blade tip)
            let originX = handX;
            let originY = handY;

            if (slot.spec.bullet?.spawnOffset) {
                const [offX, offY] = slot.spec.bullet.spawnOffset;
                const cos = Math.cos(angle);
                const sin = Math.sin(angle);
                const effectiveOffY = Math.cos(angle) < 0 ? -offY : offY;
                originX += cos * offX - sin * effectiveOffY;
                originY += sin * offX + cos * effectiveOffY;
            }

            const meleeRotationOffset =
                slot.spec.bullet?.rotationOffset ?? slot.spec.visual?.rotationOffset ?? 0;
            const meleeBullet = spawnMeleeHitbox(this.scene, this.matter, {
                origin: { x: originX, y: originY },
                angle,
                range: slot.spec.range ?? 120,
                hitWidth: slot.spec.hitWidth ?? 60,
                hitHeight: slot.spec.hitHeight ?? 80,
                damage: slot.spec.damage,
                texture: slot.spec.bullet?.texture,
                scale: slot.spec.bullet?.scale ?? 0.18,
                rotationOffset: meleeRotationOffset,
                swingAngle: slot.spec.visual?.swingAngle,
            });

            this.bullets.push(meleeBullet);
            slot.ammo = 1;
            return;
        }

        this.visualController.triggerRecoil();

        // Calculate exact muzzle tip position for bullet release
        const muzzlePos = this.visualController.getMuzzlePosition(handX, handY);

        const n = slot.spec.bulletsPerShot ?? 1;
        const projectile = slot.spec.projectile;
        if (!projectile) return; // melee-only weapons don't fire
        const { speed, visual: size } = projectile;
        EventBus.emit(SFX_EVENT(slot.spec.sfx?.shoot ?? 'player-shoot'));
        // Spread only when n > 1 (shotgun-style). Single-shot weapons fire straight.
        const spreadDeg = n > 1 ? 16 : 0;
        for (let i = 0; i < n; i++) {
            const t = n === 1 ? 0 : (i - (n - 1) / 2) * (spreadDeg / Math.max(1, n - 1));
            const a = angle + (t * Math.PI) / 180;
            const v = bulletVelocity(a, speed);

            let originX = muzzlePos.x;
            let originY = muzzlePos.y;
            if (slot.spec.bullet?.spawnOffset) {
                const [offX, offY] = slot.spec.bullet.spawnOffset;
                const cos = Math.cos(a);
                const sin = Math.sin(a);
                const effectiveOffY = Math.cos(angle) < 0 ? -offY : offY;
                originX += cos * offX - sin * effectiveOffY;
                originY += sin * offX + cos * effectiveOffY;
            }

            const bullet = spawnProjectile(
                this.scene,
                this.matter,
                { x: originX, y: originY },
                { x: v.x, y: v.y },
                {
                    label: 'player-bullet',
                    category: CAT.BULLET,
                    mask: PROJECTILE_PLAYER_MASK,
                    speed,
                    damage: slot.spec.damage,
                    size,
                    texture: slot.spec.bullet?.texture,
                    scale: slot.spec.bullet?.scale,
                    anchor: slot.spec.bullet?.anchor,
                    color: slot.spec.projectile?.visual?.color,
                    maxDistance: slot.spec.range,
                    rotationOffset: slot.spec.bullet?.rotationOffset,
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
