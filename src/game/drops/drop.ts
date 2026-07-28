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
import { CAT } from '@/lib/constants';
import type { DropSpec } from '@/lib/drops';
import type { DropSpawn } from '@/lib/levels/types';

import { planDropEffect } from './logic';

// ─── Entity ──────────────────────────────────────────────────────────────

export class DropInstance {
    readonly spec: DropSpec;
    readonly body: MatterJS.BodyType;
    readonly rect: Phaser.GameObjects.Rectangle;
    taken = false;

    constructor(scene: Phaser.Scene, spec: DropSpec, x: number, y: number) {
        this.spec = spec;

        this.body = scene.matter.add.circle(x, y, spec.visual.size / 2, {
            label: 'drop',
            isSensor: true,
            collisionFilter: {
                category: CAT.CHARACTER, // reusing the category bit (sensor, no physics)
                mask: CAT.CHARACTER,
            },
        });

        this.rect = scene.add.rectangle(
            x,
            y,
            spec.visual.size,
            spec.visual.size,
            spec.visual.tint,
            0.9,
        );
        this.rect.setStrokeStyle(2, 0x111827, 1);
    }

    destroy(scene: Phaser.Scene): void {
        scene.matter.world.remove(this.body);
        this.rect.destroy();
    }
}

// ─── Controller ──────────────────────────────────────────────────────────

export interface DropControllerCallbacks {
    /** Called on weapon pickup — character owns the runtime; we tell it
     *  which weapon id to switch to. */
    onWeaponPickup: (weaponId: string) => void;
}

export class DropController {
    private readonly scene: Phaser.Scene;
    private readonly character: CharacterRuntime;
    private readonly staticDrops: DropInstance[] = [];
    private readonly runtimeDrops: DropInstance[] = [];
    private readonly cb: DropControllerCallbacks;

    constructor(
        scene: Phaser.Scene,
        character: CharacterRuntime,
        spawns: DropSpawn[] | undefined,
        getDrop: (id: string) => DropSpec,
        cb: DropControllerCallbacks,
    ) {
        this.scene = scene;
        this.character = character;
        this.cb = cb;

        // Self-spawn static drops at scene init.
        if (spawns) {
            for (const s of spawns) {
                this.staticDrops.push(new DropInstance(scene, getDrop(s.type), s.x, s.y));
            }
        }

        this.bindCollisions();
    }

    /** Spawn a drop at the given position from monster death rolls. */
    spawn(spec: DropSpec, x: number, y: number): DropInstance {
        const d = new DropInstance(this.scene, spec, x, y);
        this.runtimeDrops.push(d);
        return d;
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
                const dropBody =
                    a.label === 'drop'
                        ? a
                        : b.label === 'drop'
                          ? b
                          : null;
                if (!dropBody) continue;
                const playerBody = dropBody === a ? b : a;
                if (playerBody !== this.character.body) continue;

                const drop = this.findDrop(dropBody as MatterJS.BodyType);
                if (!drop) continue;
                if (drop.taken) continue;
                drop.taken = true;
                this.applyEffect(drop.spec);
                this.removeDrop(drop);
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

    private applyEffect(spec: DropSpec): void {
        planDropEffect(spec, {
            heal: (hp, sp) => this.character.heal(hp, sp),
            refillAmmo: (f) => this.character.refillAmmo(f),
            onWeaponPickup: (id) => this.cb.onWeaponPickup(id),
        });
    }
}