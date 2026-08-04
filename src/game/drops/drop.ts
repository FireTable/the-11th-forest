/**
 * src/game/drops/drop.ts
 * --------------------------------------------------------------------------
 * Drops module — entity + controller in one file.
 *
 *   - DropInstance: a single drop on the map (sensor body + visual).
 *   - DropController: scene-side orchestrator. Spawns static drops at
 *     scene init + monster-death drops, and applies pickup effects on
 *     collisionstart. Pure effect dispatch lives in `./logic.ts`.
 */

import * as Phaser from 'phaser';

import type { CharacterRuntime } from '@/game/characters/character';
import { CAT, DROP_CONFIG, SFX_EVENT, WALL_PLAYER_MASK } from '@/lib/constants';
import { EventBus } from '@/lib/events/bus';
import type { DropSpec } from '@/lib/drops';
import type { DropSpawn } from '@/lib/levels/types';
import type { WeaponSpec } from '@/lib/weapons';

import { useGameStore } from '@/store/game-store';

import { planDropEffect } from './logic';

// ─── Entity ──────────────────────────────────────────────────────────────

export function textureKey(spec: DropSpec): string {
    return `drop:${spec.id}`;
}

export function animKey(spec: DropSpec, track: string): string {
    return `drop:anim:${spec.id}:${track}`;
}

export function loadDropAssets(scene: Pick<Phaser.Scene, 'load'>, specs: Iterable<DropSpec>): void {
    for (const spec of specs) {
        if (!spec.sprite) continue;
        const key = textureKey(spec);
        const url = spec.sprite.texture.startsWith('/')
            ? spec.sprite.texture
            : `/${spec.sprite.texture}`;

        scene.load.spritesheet(key, url, {
            frameWidth: 64,
            frameHeight: 64,
        });
    }
}

export function createDropAnims(
    scene: Pick<Phaser.Scene, 'anims'>,
    specs: Iterable<DropSpec>,
): void {
    if (!DROP_CONFIG.ENABLE_ANIMATION) return;
    for (const spec of specs) {
        if (!spec.sprite || !spec.anims) continue;
        const key = textureKey(spec);
        for (const [track, animSpec] of Object.entries(spec.anims)) {
            const trackKey = animKey(spec, track);
            if (scene.anims.exists(trackKey)) scene.anims.remove(trackKey);

            const [start, end] = animSpec.frames;
            const frames: Phaser.Types.Animations.AnimationFrame[] = [];
            for (let i = start; i <= end; i++) {
                frames.push({ key, frame: i });
            }
            scene.anims.create({
                key: trackKey,
                frames,
                frameRate: animSpec.frameRate,
                repeat: animSpec.repeat ?? -1,
            });
        }
    }
}

export class DropInstance {
    readonly spec: DropSpec;
    readonly body: MatterJS.BodyType;
    readonly rect: Phaser.GameObjects.Rectangle;
    readonly sprite?: Phaser.GameObjects.Sprite;
    /** When this drop is a weapon pickup, override the spec's
     *  `effect.weaponId` with this so the on-pickup callback resolves
     *  to the actual weapon the player is standing on (multiple
     *  dropSpawns can share one generic drop spec). Also used by the
     *  visual layer — when present, the weapon's own `visual.texture`
     *  replaces the spec's spritesheet so the drop on the ground looks
     *  like the weapon you pick up. */
    readonly weaponSpec?: WeaponSpec;
    private arcGraphics?: Phaser.GameObjects.Graphics;

    taken = false;
    isLanded = true;
    isAttracting = false;

    constructor(
        scene: Phaser.Scene,
        spec: DropSpec,
        x: number,
        y: number,
        isFromMonster = false,
        weaponSpec?: WeaponSpec,
    ) {
        this.spec = spec;
        this.weaponSpec = weaponSpec;

        // If from monster, calculate wall-clamped landing position for parabolic drop
        let targetX = x;
        let targetY = y;

        if (isFromMonster) {
            this.isLanded = false;
            const popConfig = DROP_CONFIG.PARABOLA;
            const angle = Math.random() * Math.PI * 2;
            const dist =
                popConfig.POP_RADIUS_MIN +
                Math.random() * (popConfig.POP_RADIUS_MAX - popConfig.POP_RADIUS_MIN);

            const desiredX = x + Math.cos(angle) * dist;
            const desiredY = y + Math.sin(angle) * dist;

            // Raycast against walls using Matter to prevent landing inside/beyond walls
            const bodies = scene.matter.world.getAllBodies().filter((b) => {
                const cat = b.collisionFilter?.category ?? 0;
                return (cat & WALL_PLAYER_MASK) !== 0;
            });

            const raycast = (Phaser as any).Physics.Matter.Matter.Query.ray(
                bodies,
                { x, y },
                { x: desiredX, y: desiredY },
            );

            if (raycast && raycast.length > 0) {
                // Ray hit a wall — land slightly before the hit point
                const hit = raycast[0];
                const hitFraction = Math.max(0, hit.fraction - 0.1);
                targetX = x + (desiredX - x) * hitFraction;
                targetY = y + (desiredY - y) * hitFraction;
            } else {
                targetX = desiredX;
                targetY = desiredY;
            }
        }

        // Initialize Matter sensor body at landing target position
        this.body = scene.matter.add.circle(targetX, targetY, spec.visual.size / 2, {
            label: 'drop',
            isSensor: true,
            collisionFilter: {
                category: CAT.CHARACTER,
                mask: CAT.CHARACTER,
            },
        });

        // Debug / fallback rectangle (hidden when sprite is present)
        this.rect = scene.add.rectangle(
            targetX,
            targetY,
            spec.visual.size,
            spec.visual.size,
            spec.visual.tint,
            0.4,
        );
        this.rect.setStrokeStyle(1.5, 0x22c55e, 1);
        this.rect.setVisible(false);

        if (weaponSpec && weaponSpec.visual?.texture && scene.textures.exists(weaponSpec.visual.texture)) {
            // Weapon pickups show the weapon's own in-hand texture so the
            // drop on the ground is visually identical to the gun you're
            // about to pick up. No spritesheet / anim — weapons are
            // single-frame static images.
            //
            // Scale: use the weapon's own `visual.scale` from the YAML so
            // every weapon renders at its hand-tuned size on the ground
            // (arcana-staff at 0.16 stays tiny, plasma-sword at 0.16
            // stays tiny, etc). The × GROUND_MULTIPLIER bump makes the
            // drop legible at world zoom — the in-hand scale is sized
            // for a tiny sprite anchored to a character body, the
            // ground drop needs to be a readable prop on its own.
            const spriteObj = scene.add.image(
                isFromMonster ? x : targetX,
                isFromMonster ? y : targetY,
                weaponSpec.visual.texture,
            );
            spriteObj.setDepth(Math.round(targetY));
            const pickupScale = weaponSpec.visual.scale ?? 0.16;
            spriteObj.setScale(pickupScale * DROP_CONFIG.WEAPON_PICKUP_SCALE_MULTIPLIER);
            this.sprite = spriteObj as unknown as Phaser.GameObjects.Sprite;
        } else if (spec.sprite && scene.textures.exists(textureKey(spec))) {
            const idleAnimKey = animKey(spec, 'idle');
            const spriteObj = scene.add.sprite(
                isFromMonster ? x : targetX,
                isFromMonster ? y : targetY,
                textureKey(spec),
            );
            spriteObj.setDepth(Math.round(targetY));
            if (spec.sprite.scale) spriteObj.setScale(spec.sprite.scale);

            if (DROP_CONFIG.ENABLE_ANIMATION && scene.anims.exists(idleAnimKey)) {
                spriteObj.play(idleAnimKey);
            } else {
                spriteObj.setFrame(0);
            }
            this.sprite = spriteObj;
        }

        // Play parabolic jump animation if dropped by monster
        if (isFromMonster && this.sprite) {
            this.playParabolicArc(scene, x, y, targetX, targetY);
        }
    }

    private playParabolicArc(
        scene: Phaser.Scene,
        startX: number,
        startY: number,
        targetX: number,
        targetY: number,
    ): void {
        const popConfig = DROP_CONFIG.PARABOLA;

        // Draw translucent neutral gray parabolic arc curve
        const graphics = scene.add.graphics();
        graphics.setDepth(Math.round(targetY) - 1);
        this.arcGraphics = graphics;

        const midX = (startX + targetX) / 2;
        const midY = (startY + targetY) / 2 - popConfig.ARC_HEIGHT;

        const curve = new Phaser.Curves.QuadraticBezier(
            new Phaser.Math.Vector2(startX, startY),
            new Phaser.Math.Vector2(midX, midY),
            new Phaser.Math.Vector2(targetX, targetY),
        );

        graphics.lineStyle(popConfig.LINE_WIDTH, popConfig.LINE_COLOR, popConfig.LINE_ALPHA);
        curve.draw(graphics);

        // Tween drop sprite along the curve
        const progressObj = { t: 0 };
        scene.tweens.add({
            targets: progressObj,
            t: 1,
            duration: popConfig.DURATION,
            ease: 'Quad.easeOut',
            onUpdate: () => {
                if (!this.sprite) return;
                const pt = curve.getPoint(progressObj.t);
                this.sprite.setPosition(pt.x, pt.y);
                this.sprite.setDepth(Math.round(pt.y));
                this.rect.setPosition(pt.x, pt.y);
            },
            onComplete: () => {
                this.isLanded = true;
                if (this.sprite) {
                    this.sprite.setPosition(targetX, targetY);
                    this.sprite.setDepth(Math.round(targetY));
                }
                this.rect.setPosition(targetX, targetY);

                // Fade out and destroy trajectory line after landing
                if (this.arcGraphics) {
                    scene.tweens.add({
                        targets: this.arcGraphics,
                        alpha: 0,
                        duration: 150,
                        onComplete: () => {
                            this.arcGraphics?.destroy();
                            this.arcGraphics = undefined;
                        },
                    });
                }
            },
        });
    }

    destroy(scene: Phaser.Scene): void {
        scene.matter.world.remove(this.body);
        this.rect.destroy();
        this.sprite?.destroy();
        this.arcGraphics?.destroy();
    }
}

// ─── Controller ──────────────────────────────────────────────────────────

export interface DropControllerCallbacks {
    /**
     * Called on weapon pickup — character owns the runtime; we tell it
     * which weapon id to switch to.
     *
     * Return value controls whether the drop is consumed:
     *   - `true`  — drop is consumed (default pickup succeeded)
     *   - `false` — drop stays on the ground (cap-replace flow is
     *               open in the hub; the drop waits for confirmation
     *               before being destroyed)
     */
    onWeaponPickup: (weaponId: string) => boolean;
}

export class DropController {
    private readonly scene: Phaser.Scene;
    private character: CharacterRuntime;
    private readonly staticDrops: DropInstance[] = [];
    private readonly runtimeDrops: DropInstance[] = [];
    private readonly cb: DropControllerCallbacks;
    /** Optional lookup used to resolve `DropSpawn.weaponId` overrides.
     *  When a static spawn sets `weaponId`, the drop's visual is
     *  switched to that weapon's in-hand texture and the pickup
     *  callback resolves to that weapon. */
    private readonly getWeapon?: (id: string) => WeaponSpec | undefined;

    constructor(
        scene: Phaser.Scene,
        character: CharacterRuntime,
        spawns: DropSpawn[] | undefined,
        getDrop: (id: string) => DropSpec,
        cb: DropControllerCallbacks,
        getWeapon?: (id: string) => WeaponSpec | undefined,
    ) {
        this.scene = scene;
        this.character = character;
        this.cb = cb;
        this.getWeapon = getWeapon;

        const dropSnapshots = useGameStore.getState().groundDropsSnapshot;
        if (dropSnapshots !== undefined && Array.isArray(dropSnapshots)) {
            // Snapshot exists for this run: restore ground drops if any remain
            for (const s of dropSnapshots) {
                try {
                    this.runtimeDrops.push(new DropInstance(scene, getDrop(s.specId), s.x, s.y, false));
                } catch {
                    // Ignore missing specs
                }
            }
        } else if (spawns) {
            // Fresh start: spawn initial static drops from level config
            for (const s of spawns) {
                const weaponOverride = s.weaponId ? this.getWeapon?.(s.weaponId) : undefined;
                this.staticDrops.push(
                    new DropInstance(
                        scene,
                        getDrop(s.type),
                        s.x,
                        s.y,
                        false,
                        weaponOverride,
                    ),
                );
            }
        }

        this.bindCollisions();
    }

    /**
     * Swap the character reference. Used by the tavern UI to rewire
     * magnet / pickup collision to the freshly-spawned character after
     * the player confirms a selection. The original character is
     * `character` is otherwise captured once at construction.
     */
    public setCharacter(character: CharacterRuntime): void {
        this.character = character;
    }

    /** Export fine-grained snapshot of uncollected ground drops. */
    public getSnapshot(): { specId: string; x: number; y: number }[] {
        const all = [...this.staticDrops, ...this.runtimeDrops];
        return all
            .filter((d) => !d.taken && d.isLanded && d.spec.id)
            .map((d) => ({
                specId: d.spec.id!,
                x: d.body.position.x,
                y: d.body.position.y,
            }));
    }

    /** Spawn a drop at the given position from monster death rolls. */
    spawn(spec: DropSpec, x: number, y: number): DropInstance {
        const d = new DropInstance(this.scene, spec, x, y, true);
        this.runtimeDrops.push(d);
        return d;
    }

    /** Update magnet attraction towards player for landed drops */
    update(): void {
        const charX = this.character.body.position.x;
        const charY = this.character.body.position.y;
        const magnet = DROP_CONFIG.MAGNET;

        const allDrops = [...this.staticDrops, ...this.runtimeDrops];

        for (const drop of allDrops) {
            if (drop.taken || !drop.isLanded) continue;

            const dropX = drop.body.position.x;
            const dropY = drop.body.position.y;

            const dist = Phaser.Math.Distance.Between(charX, charY, dropX, dropY);

            // Trigger magnet attraction when within radius
            if (dist <= magnet.RADIUS) {
                drop.isAttracting = true;
            }

            if (drop.isAttracting) {
                // Lerp towards character position
                const newX = Phaser.Math.Linear(dropX, charX, magnet.FLY_SPEED);
                const newY = Phaser.Math.Linear(dropY, charY, magnet.FLY_SPEED);

                // Update Matter body & sprite position
                (Phaser as any).Physics.Matter.Matter.Body.setPosition(drop.body, {
                    x: newX,
                    y: newY,
                });

                if (drop.sprite) {
                    drop.sprite.setPosition(newX, newY);
                    drop.sprite.setDepth(Math.round(newY));
                }
                drop.rect.setPosition(newX, newY);

                // Check final pickup threshold
                if (dist <= magnet.PICKUP_DISTANCE) {
                    const consumed = this.applyEffect(drop);
                    if (consumed) {
                        drop.taken = true;
                        this.removeDrop(drop);
                    } else {
                        // Cap-replace flow: hub is open. Stop attracting
                        // so the drop doesn't keep chasing the player;
                        // collision pickup won't re-trigger because
                        // `drop.taken` stays false but we also short-
                        // circuit the loop below.
                        drop.isAttracting = false;
                    }
                }
            }
        }
    }

    destroy(): void {
        for (const d of this.staticDrops) d.destroy(this.scene);
        for (const d of this.runtimeDrops) d.destroy(this.scene);
        this.staticDrops.length = 0;
        this.runtimeDrops.length = 0;
    }

    private bindCollisions(): void {
        this.scene.matter.world.on('collisionstart', (event: any) => {
            const pairs = event.pairs || [];
            for (const pair of pairs) {
                const a = pair.bodyA;
                const b = pair.bodyB;
                if (!a || !b) continue;
                const dropBody = a.label === 'drop' ? a : b.label === 'drop' ? b : null;
                if (!dropBody) continue;
                const playerBody = dropBody === a ? b : a;
                if (playerBody !== this.character.body) continue;

                const drop = this.findDrop(dropBody as MatterJS.BodyType);
                if (!drop) continue;
                if (drop.taken || !drop.isLanded) continue;
                const consumed = this.applyEffect(drop);
                if (consumed) {
                    drop.taken = true;
                    this.removeDrop(drop);
                } else {
                    // Cap-replace flow keeps the drop on the ground
                    // until the hub confirms. Stop attracting so it
                    // doesn't ride the player's center while the
                    // hub is open.
                    drop.isAttracting = false;
                }
            }
        });
    }

    private findDrop(body: MatterJS.BodyType): DropInstance | null {
        for (const d of this.staticDrops) if (d.body === body) return d;
        for (const d of this.runtimeDrops) if (d.body === body) return d;
        return null;
    }

    private removeDrop(d: DropInstance): void {
        const sIdx = this.staticDrops.indexOf(d);
        if (sIdx >= 0) this.staticDrops.splice(sIdx, 1);
        const rIdx = this.runtimeDrops.indexOf(d);
        if (rIdx >= 0) this.runtimeDrops.splice(rIdx, 1);
        d.destroy(this.scene);
    }

    private applyEffect(dropInstance: DropInstance): boolean {
        // Emit SFX BEFORE applying effect so the audio engine can play
        // before the pickup animation / freeze-frame finishes. Falls
        // back to a generic pickup tone when the spec doesn't declare
        // its own.
        const spec = dropInstance.spec;
        const sfxId = spec.sfx ?? 'pickup-generic';
        EventBus.emit(SFX_EVENT(sfxId), {
            key: `drop:${spec.id}`,
            throttleMs: spec.throttleMs,
        });
        // For weapon drops carrying a weaponSpec override, the spec's
        // embedded `effect.weaponId` is the generic placeholder —
        // resolve to the actual weapon's id so the pickup handler
        // adds the right weapon to the hotbar. Other drop types
        // (instant / refill-ammo) go through planDropEffect normally.
        const effectiveSpec: DropSpec = dropInstance.weaponSpec
            ? ({
                  ...spec,
                  effect: { type: 'weapon', weaponId: dropInstance.weaponSpec.id },
              } as DropSpec)
            : spec;
        // Default consumed=true covers non-weapon drops (instant /
        // refill-ammo) which have no opt-out path. For weapons the
        // callback returns false when the cap-replace hub has not
        // confirmed yet — the caller (magnet loop / collisionstart)
        // uses this to keep the drop on the ground.
        let consumed = true;
        planDropEffect(effectiveSpec, {
            heal: (hp, sp) => this.character.heal(hp, sp),
            refillAmmo: (f) => this.character.refillAmmo(f),
            onWeaponPickup: (id) => {
                consumed = this.cb.onWeaponPickup(id);
            },
        });
        return consumed;
    }

    /**
     * Destroy the still-on-ground weapon drop the cap-replace hub is
     * negotiating. Called by the scene after `weapon-replace-confirm`
     * commits the swap, so the drop never lingers once the player has
     * actually committed to the new weapon.
     */
    acknowledgePendingPickup(weaponId: string): void {
        const all = [...this.staticDrops, ...this.runtimeDrops];
        const target = all.find(
            (d) => !d.taken && d.spec.kind === 'static' && d.weaponSpec?.id === weaponId,
        );
        if (!target) return;
        this.removeDrop(target);
    }
}
