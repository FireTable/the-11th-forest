import { Scene } from 'phaser';

import { loadCharacter, type CharacterRuntime } from '@/game/characters/character';
import { DropController } from '@/game/drops/drop';
import { MonsterController, rollDrops } from '@/game/monsters/monster';
import { EventBus } from '@/lib/events/bus';
import { setCurrentLevel } from '@/lib/levels/current-level';
import type { CharacterSpec } from '@/lib/characters';
import type { DropSpec } from '@/lib/drops';
import type { Level } from '@/lib/levels/types';
import type { MonsterSpec } from '@/lib/monsters';
import type { WeaponSpec } from '@/lib/weapons';

import { createWallBodies } from '@/game/walls/wall';

/**
 * Payload the Game shell hands to the scene after pre-fetching all data
 * (level + weapons + character + monster types + drop types referenced
 * by this level). Phaser's init() does NOT await async work, so anything
 * async is resolved in main.ts before the Game is constructed.
 *
 * Maps are keyed by id for O(1) lookup during scene spawn. Drop types
 * only need static-spawn entries; monster-death drops are resolved on
 * demand inside the DropController callback (kept lazy until Phase 5).
 */
export interface SceneAssets {
    /** All weapons (player hotbar + monster weapons), keyed by id. */
    weaponsById: Map<string, WeaponSpec>;
    /** Player hotbar (subset of weaponsById, in order). */
    weapons: WeaponSpec[];
    character: CharacterSpec;
    monsterSpecs: Map<string, MonsterSpec>;
    dropSpecs: Map<string, DropSpec>;
}

/**
 * Generic scene loader. The Level is fetched by the caller (main.ts)
 * and passed in via the constructor — Phaser's `init()` does NOT await
 * async work, so doing the fetch here would race with `preload()`.
 *
 * One scene class covers every level — there is no per-level file.
 *
 * This scene only renders the background image. Wall rendering and the
 * editor's drawing tools live in the editor panel (Konva overlay), not
 * here. Keeps the scene focused on what gameplay needs.
 */
export class LoadScene extends Scene {
    private character!: CharacterRuntime;
    private monsterSystem!: MonsterController;
    private dropSystem!: DropController;

    constructor(
        private readonly id: string,
        private readonly level: Level,
        private readonly assets: SceneAssets,
    ) {
        super(`LoadScene:${id}`);
    }

    preload(): void {
        this.load.image('background', this.level.background);
    }

    create(): void {
        // World size === image size, so the background displays at native
        // dimensions and air-wall coords align 1:1 with image pixel space.
        this.add.image(0, 0, 'background').setOrigin(0, 0);

        // Lock the physics world to the level image bounds so the
        // character can't run off-screen. thickness=200 is generous so
        // corners are fully covered and a fast body can't tunnel.
        this.matter.world.setBounds(
            0,
            0,
            this.level.imageSize.width,
            this.level.imageSize.height,
            200,
        );

        // Build static Matter bodies for every air wall — see load-wall.ts
        // for category / mask policy.
        createWallBodies(this.matter, this.level.airWalls);

        // Spawn the player character (WASD + Shift dodge + hotbar).
        this.character = loadCharacter(this, this.level, this.assets.character, this.assets.weapons);

        // Wire monster controller — self-spawns from level.monsters.
        this.monsterSystem = new MonsterController(
            this,
            this.level.monsters?.map((m) => ({
                spec: this.assets.monsterSpecs.get(m.type)!,
                weapon: this.assets.weaponsById.get(
                    this.assets.monsterSpecs.get(m.type)!.weaponId,
                )!,
                x: m.x,
                y: m.y,
            })),
            this.character.body,
            {
                onMonsterDied: (monster) => {
                    const mp = monster.body.position;
                    const rolled = rollDrops(monster.spec.drops, (dropId) => {
                        const spec = this.assets.dropSpecs.get(dropId);
                        if (!spec) {
                            throw new Error(`Unknown drop id: ${dropId}`);
                        }
                        return spec;
                    });
                    for (const r of rolled) {
                        this.dropSystem.spawn(r.spec as never, mp.x, mp.y);
                    }
                },
                onPlayerHit: (damage) => this.character.heal(-damage, 0),
            },
        );

        // Wire drop controller — self-spawns from level.dropSpawns.
        this.dropSystem = new DropController(
            this,
            this.character,
            this.level.dropSpawns,
            (id) => {
                const spec = this.assets.dropSpecs.get(id);
                if (!spec) throw new Error(`Unknown drop id: ${id}`);
                return spec;
            },
            {
                onWeaponPickup: (weaponId) => {
                    // ponytail: weapon pickup isn't supported in the demo's
                    // fixed hotbar. Acknowledge the pickup by destroying the
                    // drop without applying — the data still parses + flows
                    // through the system.
                    void weaponId;
                },
            },
        );

        // Wire bullet → monster damage flow. Player bullet only. (Player
        // bullet has its own destruction listener; this hook runs BEFORE
        // WeaponController's listener to ensure damage lands first.)
        this.matter.world.on('collisionstart', (event: any) => {
            const pairs = event.pairs || [];
            for (const pair of pairs) {
                const a = pair.bodyA;
                const b = pair.bodyB;
                if (!a || !b) continue;
                const bullet =
                    a.label === 'player-bullet' ? a : b.label === 'player-bullet' ? b : null;
                if (!bullet) continue;
                const other = bullet === a ? b : a;
                if (other.label !== 'monster') continue;
                this.monsterSystem.applyBulletDamage(
                    this.character.weapons.getActive().damage,
                    bullet,
                );
            }
        });

        // Center camera on world so the viewport shows the middle of the
        // level when the browser window is smaller than the image.
        this.cameras.main.centerOn(
            this.level.imageSize.width / 2,
            this.level.imageSize.height / 2,
        );

        // Per-frame monster tick.
        this.events.on('update', () => {
            this.monsterSystem.update(this.time.now);
        });

        // Tell the editor panel which scene this is. Both the EventBus
        // (for panel listeners mounted before create()) and the module-
        // level cache (for lazy-loaded panels mounting after create())
        // get the payload.
        const payload = { id: this.id, level: this.level };
        setCurrentLevel(payload);
        EventBus.emit('level-loaded', payload);
        EventBus.emit('current-scene-ready', this);
    }
}
