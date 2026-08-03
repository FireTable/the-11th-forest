import * as Phaser from 'phaser';

import {
    createCharacterAnims,
    loadCharacter,
    loadCharacterAssets,
    type CharacterRuntime,
} from '@/game/characters/character';
import { AudioController, loadAudioAssets } from '@/game/audios/logic';
import { createDropAnims, DropController, loadDropAssets } from '@/game/drops/drop';
import { MaterialManager } from '@/game/materials/material';
import {
    createMonsterAnims,
    loadMonsterAssets,
    MonsterController,
    rollDrops,
} from '@/game/monsters/monster';

async function getMonsterSpriteCellDims(
    spec: MonsterSpec,
): Promise<{ width: number; height: number }> {
    const sprite = spec.sprite;
    const grid = sprite?.grid;
    if (!sprite || !grid) return { width: 0, height: 0 };
    const url = sprite.texture.startsWith('/') ? sprite.texture : `/${sprite.texture}`;
    const natural = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => reject(new Error(`Failed to load ${url}`));
        img.src = url;
    });
    return {
        width: Math.floor(natural.width / grid.cols),
        height: Math.floor(natural.height / grid.rows),
    };
}
import { PathfindingService } from '@/game/monsters/logic';
import {
    createPathDebugOverlay,
    type PathDebugOverlayHandles,
} from '@/game/monsters/path-debug-overlay';
import { DEPTH, MUSIC_EVENT, PIXEL_LIGHTING_CONFIG } from '@/lib/constants';
import { EventBus } from '@/lib/events/bus';
import { setCurrentLevel } from '@/lib/levels/current-level';
import { useGameStore } from '@/store/game-store';
import type { MusicSpec, SfxSpec, SoundSpec } from '@/lib/audios';
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
    /** Computed cell size for the character sprite sheet. */
    spriteCell: { width: number; height: number };
    monsterSpecs: Map<string, MonsterSpec>;
    dropSpecs: Map<string, DropSpec>;
    /** SFX + music loaded from audios/index.yaml. */
    sfxSpecs: Map<string, SfxSpec>;
    musicSpecs: Map<string, MusicSpec>;
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
import { TeleporterController } from '@/game/scenes/teleporter';
import { loadWeaponAssets } from '@/game/weapons/weapon';

export class LoadScene extends Phaser.Scene {
    private character!: CharacterRuntime;
    private monsterSystem!: MonsterController;
    private dropSystem!: DropController;
    private materialManager!: MaterialManager;
    private teleporterSystem!: TeleporterController;
    private audio!: AudioController;
    private pathDebugOverlay!: PathDebugOverlayHandles;
    /** `this.time.now` value at the moment create() finished wiring the
     *  level. Subtracted from current `this.time.now` to get elapsed. */
    private levelStartAt = 0;
    /** Last time we wrote the save state (clock + snapshots). Throttled
     *  to 1Hz — see `tickSaveState`. */
    private lastSavePushAt = 0;

    constructor(
        private readonly id: string,
        private readonly level: Level,
        private readonly assets: SceneAssets,
    ) {
        super(`LoadScene:${id}`);
    }

    preload(): void {
        this.load.image('background', this.level.background);
        // The character module owns its own asset loading + animation
        // registration; we just delegate here, with cell dims derived
        // in main.ts from the texture's natural size + grid.
        loadCharacterAssets(
            this,
            this.assets.character,
            this.assets.spriteCell.width,
            this.assets.spriteCell.height,
        );
        // Load monster spritesheet assets (if spec contains sprite config)
        loadMonsterAssets(this, this.assets.monsterSpecs.values(), getMonsterSpriteCellDims);
        // Load drop spritesheet assets
        loadDropAssets(this, this.assets.dropSpecs.values());
        // Load weapon & bullet visual assets
        loadWeaponAssets(this, this.assets.weaponsById.values());
        // Audio assets — every SFX + music track gets queued here.
        loadAudioAssets(this, [
            ...this.assets.sfxSpecs.values(),
            ...this.assets.musicSpecs.values(),
        ] as Iterable<SoundSpec>);
        MaterialManager.preloadMaterials(this, this.level.materials);
    }

    create(): void {
        // World size === image size, so the background displays at native
        // dimensions and air-wall coords align 1:1 with image pixel space.
        const bg = this.add.image(0, 0, 'background').setOrigin(0, 0);
        const isPixelLightingEnabled = this.level.pixelLighting ?? PIXEL_LIGHTING_CONFIG.ENABLE;
        if (isPixelLightingEnabled) {
            bg.setTint(PIXEL_LIGHTING_CONFIG.BACKGROUND_TINT);
        }

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

        // Build static Matter bodies for every air wall + outer boundary walls.
        createWallBodies(this.matter, this.level.airWalls, this.level.imageSize);

        // Register character anims once the sprite sheet has finished loading.
        createCharacterAnims(this, this.assets.character);
        // Register monster anims for all loaded monster specs.
        createMonsterAnims(this, this.assets.monsterSpecs.values());
        // Register drop anims.
        createDropAnims(this, this.assets.dropSpecs.values());

        // Spawn the player character (WASD + Shift dodge + hotbar).
        this.character = loadCharacter(
            this,
            this.level,
            this.assets.character,
            this.assets.weapons,
        );

        // Editor panel hides the on-canvas HUDs so the level / walls are
        // unencumbered for editing. EditorPanel emits via EventBus since
        // it lives in React and can't reach Phaser GameObjects directly.
        const setHubsVisible = (visible: boolean) => {
            this.character.hud.setVisible(visible);
            this.character.weaponHud.setVisible(visible);
            this.character.statusHud.setVisible(visible);
        };
        const onEditorOpen = (editorOpen: unknown) => {
            const isEditor = editorOpen === true;
            setHubsVisible(!isEditor);
            this.character.debugBodyRect.setVisible(isEditor);
            this.character.debugHitboxRect.setVisible(isEditor);
            this.monsterSystem.setDebugVisible(isEditor);
            this.pathDebugOverlay.setVisible(isEditor);
        };
        EventBus.on('editor-open', onEditorOpen);
        const unbindEditorOpen = () => EventBus.removeListener('editor-open', onEditorOpen);
        this.events.once('shutdown', unbindEditorOpen);
        this.events.once('destroy', unbindEditorOpen);

        // Initialize A* Pathfinding service with level air walls
        const pathfinder = new PathfindingService(this.level.imageSize, this.level.airWalls);

        // Editor-only visualisation of the grid + per-monster paths.
        // Stays hidden in production; toggled by the editor-open event.
        this.pathDebugOverlay = createPathDebugOverlay(this, pathfinder);

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
                trigger: m.trigger,
                waveId: m.waveId,
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
            pathfinder,
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
                if (other.label !== 'monster' && other.label !== 'monster-hitbox') continue;
                this.monsterSystem.applyBulletDamage(
                    this.character.weapons.getActive().damage,
                    other,
                );
            }
        });

        // Wire AudioController (subscribes to EventBus sfx:*/music:* events).
        this.audio = new AudioController(
            this,
            this.assets.sfxSpecs.values(),
            this.assets.musicSpecs.values(),
        );
        // Honk the level's chosen music, if any.
        if (this.level.music) {
            EventBus.emit(MUSIC_EVENT(this.level.music));
        }

        // Center camera on world so the viewport shows the middle of the
        // level when the browser window is smaller than the image.
        this.cameras.main.centerOn(this.level.imageSize.width / 2, this.level.imageSize.height / 2);

        // Per-frame monster tick & material Y-sorting & drop update.
        this.materialManager = new MaterialManager(this, this.level);

        // Optional Pixel Art Light & PostFX pipeline (enabled via PIXEL_LIGHTING_CONFIG.ENABLE or level YAML)
        if (isPixelLightingEnabled) {
            // 1. Add Phaser 4 PointLight around player
            const playerLight = (this.add as any).pointlight(
                this.character.body.position.x,
                this.character.body.position.y,
                PIXEL_LIGHTING_CONFIG.LIGHT_COLOR,
                PIXEL_LIGHTING_CONFIG.LIGHT_RADIUS_X,
                PIXEL_LIGHTING_CONFIG.LIGHT_INTENSITY,
                PIXEL_LIGHTING_CONFIG.LIGHT_ATTENUATION,
            );
            if (playerLight?.setScale) {
                playerLight.setScale(
                    1.0,
                    PIXEL_LIGHTING_CONFIG.LIGHT_RADIUS_Y / PIXEL_LIGHTING_CONFIG.LIGHT_RADIUS_X,
                );
            }
            playerLight.setDepth?.(DEPTH.LIGHT);

            // Update light position every frame following the player character
            this.events.on('update', () => {
                if (this.character?.body?.position && playerLight) {
                    playerLight.setPosition(
                        this.character.body.position.x,
                        this.character.body.position.y,
                    );
                }
            });

            // 2. Apply Phaser 4 native filters: Pixelate + Quantize
            const cameraAny = this.cameras.main as any;
            if (cameraAny.filters?.internal) {
                if (
                    PIXEL_LIGHTING_CONFIG.PIXELATE_AMOUNT > 0 &&
                    cameraAny.filters.internal.addPixelate
                ) {
                    cameraAny.filters.internal.addPixelate(PIXEL_LIGHTING_CONFIG.PIXELATE_AMOUNT);
                }
                if (PIXEL_LIGHTING_CONFIG.USE_QUANTIZE && cameraAny.filters.internal.addQuantize) {
                    cameraAny.filters.internal.addQuantize({
                        steps: [...PIXEL_LIGHTING_CONFIG.QUANTIZE_STEPS],
                        dither: PIXEL_LIGHTING_CONFIG.QUANTIZE_DITHER,
                        mode: 0,
                    });
                }
            }

            this.events.on('update', () => {
                if (this.character?.body?.position && playerLight) {
                    playerLight.setPosition(
                        this.character.body.position.x,
                        this.character.body.position.y,
                    );
                }
            });
        }

        // Wire TeleporterController (code-drawn magic circle & scene transition)
        this.teleporterSystem = new TeleporterController(
            this,
            this.level.teleporters,
            this.id,
            () => (this.character?.body?.position ? this.character.body.position : null),
            () => this.monsterSystem.isAllCleared(),
        );

        this.events.on('update', (_time: number, delta: number) => {
            this.monsterSystem.update(this.time.now);
            this.pathDebugOverlay.refresh(this.monsterSystem.getDebugMonsters(), this.character.body);
            this.dropSystem.update();
            this.materialManager.update();
            this.teleporterSystem.update(delta);
            // Persist clock + entity snapshots to the UI store (1Hz).
            this.tickSaveState();
        });

        // Tell the editor panel which scene this is. Both the EventBus
        // (for panel listeners mounted before create()) and the module-
        // level cache (for lazy-loaded panels mounting after create())
        // get the payload.
        const payload = { id: this.id, level: this.level };
        setCurrentLevel(payload);
        useGameStore.getState().setCurrentLevelId(this.id);
        useGameStore.getState().setLevelTitle(this.level.title || this.id);
        const savedElapsedMs = useGameStore.getState().levelElapsedMs || 0;
        this.levelStartAt = this.time.now - savedElapsedMs;
        this.lastSavePushAt = this.time.now;
        useGameStore.getState().setLevelElapsedMs(savedElapsedMs);
        EventBus.emit('level-loaded', payload);
        EventBus.emit('current-scene-ready', this);
    }

    shutdown(): void {
        this.teleporterSystem?.destroy();
        this.audio?.destroy();
        this.pathDebugOverlay?.destroy();
    }

    /**
     * Push everything the save file needs — level clock plus player /
     * monster / drop snapshots — in a single store write, throttled to
     * 1Hz.
     *
     * One write per second is the point, not an accident: the store is
     * wrapped in zustand's `persist`, which serialises the whole
     * partialized state and writes localStorage synchronously on every
     * `set`. At the old 5Hz clock rate that meant JSON.stringify-ing the
     * live monster list five times a second on the main thread. 1Hz also
     * matches the HUD clock's own MM:SS resolution, so nothing is lost.
     */
    private tickSaveState(): void {
        const now = this.time.now;
        if (now - this.lastSavePushAt < 1000) return;
        this.lastSavePushAt = now;

        const playerPos = this.character?.body?.position;
        useGameStore.getState().setEntitySnapshots({
            player: playerPos
                ? { x: Math.round(playerPos.x), y: Math.round(playerPos.y) }
                : undefined,
            monsters: this.monsterSystem?.getSnapshot(),
            drops: this.dropSystem?.getSnapshot(),
            elapsedMs: now - this.levelStartAt,
        });
    }
}
