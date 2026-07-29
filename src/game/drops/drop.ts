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

export function textureKey(spec: DropSpec): string {
    return `drop:${spec.id}`;
}

export function animKey(spec: DropSpec, track: string): string {
    return `drop:anim:${spec.id}:${track}`;
}

export function loadDropAssets(
    scene: Pick<Phaser.Scene, 'load'>,
    specs: Iterable<DropSpec>,
): void {
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
    taken = false;

    constructor(scene: Phaser.Scene, spec: DropSpec, x: number, y: number) {
        this.spec = spec;

        this.body = scene.matter.add.circle(x, y, spec.visual.size / 2, {
            label: 'drop',
            isSensor: true,
            collisionFilter: {
                category: CAT.CHARACTER,
                mask: CAT.CHARACTER,
            },
        });

        // Debug / fallback rectangle (hidden when sprite is present)
        this.rect = scene.add.rectangle(
            x,
            y,
            spec.visual.size,
            spec.visual.size,
            spec.visual.tint,
            0.4,
        );
        this.rect.setStrokeStyle(1.5, 0x22c55e, 1);
        this.rect.setVisible(false);

        if (spec.sprite && scene.textures.exists(textureKey(spec))) {
            const idleAnimKey = animKey(spec, 'idle');
            const spriteObj = scene.add.sprite(x, y, textureKey(spec));
            spriteObj.setDepth(Math.round(y));
            if (spec.sprite.scale) spriteObj.setScale(spec.sprite.scale);

            if (scene.anims.exists(idleAnimKey)) {
                spriteObj.play(idleAnimKey);
            }
            this.sprite = spriteObj;
        }
    }

    destroy(scene: Phaser.Scene): void {
        scene.matter.world.remove(this.body);
        this.rect.destroy();
        this.sprite?.destroy();
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