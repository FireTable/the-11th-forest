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
import { DEPTH, MUSIC_EVENT, MUSIC_STOP, PIXEL_LIGHTING_CONFIG, SFX_EVENT } from '@/lib/constants';
import { EventBus } from '@/lib/events/bus';
import { setCurrentLevel } from '@/lib/levels/current-level';
import { fetchLevelIndex } from '@/lib/levels/loader';
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
    /** Weapon ids referenced by monster specs in this level. Their
     *  `visual.texture` is NOT loaded — only `bullet.texture` is. */
    monsterWeaponIds: Set<string>;
    /** Weapon ids the player can hold / see rendered: character hotbar
     *  + tavern dropSpawn entries. These get the full visual+bullet
     *  texture load. */
    playerWeaponIds: Set<string>;
    /** Tavern mode only: all playable characters for NPC display + selection. */
    allCharacters?: CharacterSpec[];
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
import { TavernController } from '@/game/scenes/tavern-controller';
import { loadWeaponAssets } from '@/game/weapons/weapon';

export class LoadScene extends Phaser.Scene {
    private character!: CharacterRuntime;
    private monsterSystem!: MonsterController;
    private dropSystem!: DropController;
    private materialManager!: MaterialManager;
    private teleporterSystem!: TeleporterController;
    private audio!: AudioController;
    private pathDebugOverlay!: PathDebugOverlayHandles;
    private tavernController?: TavernController;
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
        // Per-scene texture key — `background` alone collides with the
        // texture cache: Phaser reuses the first loaded image under
        // that key, so every subsequent scene would render the first
        // scene's background. Namespace with the scene id.
        this.load.image(`background:${this.id}`, this.level.background);

        // Default player character — same key scheme in both modes; the
        // tavern just spawns additional NPC sheets on top so the player
        // can pick from a roster.
        loadCharacterAssets(
            this,
            this.assets.character,
            this.assets.spriteCell.width,
            this.assets.spriteCell.height,
        );
        if (this.level.tavern) {
            // Tavern NPCs: every other character in the roster gets its
            // own spritesheet so TavernController can spawn idle sprites
            // for the selection UI.
            const allChars = this.assets.allCharacters ?? [];
            for (const spec of allChars) {
                loadCharacterAssets(this, spec, 128, 128);
            }
        }

        // Load monster spritesheet assets (if spec contains sprite config)
        loadMonsterAssets(this, this.assets.monsterSpecs.values(), getMonsterSpriteCellDims);
        // Load drop spritesheet assets
        loadDropAssets(this, this.assets.dropSpecs.values());
        // Load weapon & bullet visual assets. Player-pickup weapons
        // (character hotbar + tavern dropSpawns) get their in-hand
        // texture loaded — the player holds them, and the drop-on-
        // ground visual reuses the same texture. Monster weapons
        // only need their bullet texture; their in-hand sprite is
        // Monster weapons also load their `visual.texture` — every
        // MonsterInstance mounts a WeaponVisualController that
        // renders the in-hand weapon sprite. Skipping that load
        // (as a "monster weapons don't need it" optimization) left
        // monsters holding invisible weapons.
        const playerWeapons = [...this.assets.playerWeaponIds]
            .map((id) => this.assets.weaponsById.get(id))
            .filter((w): w is WeaponSpec => Boolean(w));
        const monsterWeapons = [...this.assets.monsterWeaponIds]
            .map((id) => this.assets.weaponsById.get(id))
            .filter((w): w is WeaponSpec => Boolean(w));
        loadWeaponAssets(this, playerWeapons, { loadVisualTexture: true });
        loadWeaponAssets(this, monsterWeapons, { loadVisualTexture: true });
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
        const bg = this.add.image(0, 0, `background:${this.id}`).setOrigin(0, 0);
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

        // ── Animations ──────────────────────────────────────────────────
        // Player character always; tavern NPCs in addition (so the
        // selection UI has idle sprites to show).
        createCharacterAnims(this, this.assets.character);
        if (this.level.tavern) {
            const allChars = this.assets.allCharacters ?? [];
            for (const spec of allChars) {
                createCharacterAnims(this, spec);
            }
        } else {
            // Tavern has no monsters; non-tavern scenes register them.
            createMonsterAnims(this, this.assets.monsterSpecs.values());
        }
        createDropAnims(this, this.assets.dropSpecs.values());

        // ── Player character ────────────────────────────────────────────
        // Tavern mode spawns a *placeholder*: a visual sprite with a
        // hidden body but NO weapons, NO HUDs, NO controller. That's
        // loadCharacter's `placeholder: true` mode — it deliberately
        // skips every gameplay module so phase 1 (NPC selection) can't
        // fire bullets, play weapon SFX, or write to the React HUD
        // store. On confirm, the scene destroys this placeholder and
        // calls loadCharacter() again with the picked spec; monster /
        // drop subsystems get rewired to the new body via their
        // setPlayerBody / setCharacter methods.
        //
        // Non-tavern levels spawn the real character directly.
        this.character = loadCharacter(
            this,
            this.level,
            this.assets.character,
            this.assets.weapons,
            {
                placeholder: this.level.tavern === true,
                weaponsById: this.assets.weaponsById,
            },
        );

        // Editor panel hides the on-canvas HUDs so the level / walls are
        // unencumbered for editing. EditorPanel emits via EventBus since
        // it lives in React and can't reach Phaser GameObjects directly.
        // Tavern placeholder has no HUDs / debug rects — skip silently.
        const setHubsVisible = (visible: boolean) => {
            this.character.hud?.setVisible(visible);
            this.character.weaponHud?.setVisible(visible);
            this.character.statusHud?.setVisible(visible);
        };
        const onEditorOpen = (editorOpen: unknown) => {
            const isEditor = editorOpen === true;
            setHubsVisible(!isEditor);
            this.character.debugBodyRect?.setVisible(isEditor);
            this.character.debugHitboxRect?.setVisible(isEditor);
            this.monsterSystem.setDebugVisible(isEditor);
        };
        EventBus.on('editor-open', onEditorOpen);
        const unbindEditorOpen = () => EventBus.removeListener('editor-open', onEditorOpen);
        this.events.once('shutdown', unbindEditorOpen);
        this.events.once('destroy', unbindEditorOpen);

        // Bind the subsystem-cleanup (audio.destroy() in particular) to
        // BOTH 'shutdown' AND 'destroy'. Phaser's SceneManager.remove()
        // path fires 'destroy' but NOT 'shutdown' (only boot() /
        // scene-transition do). Without the 'destroy' hook, every old
        // AudioController stays subscribed to the music event bus
        // after a scene swap, and the new scene's MUSIC_EVENT makes
        // both controllers try to play — stacked BGM. idempotent via
        // `isShutdown` so the double-binding doesn't run cleanup twice.
        this.events.once('shutdown', () => this.shutdown());
        this.events.once('destroy', () => this.shutdown());

        // Path-debug overlay stays hidden until the designer opts in via
        // the toggle in the Air-walls section — defaulting to off keeps
        // the canvas readable for the common case of just editing walls.
        const onPathDebugVisible = (visible: unknown) => {
            this.pathDebugOverlay.setVisible(visible === true);
        };
        EventBus.on('path-debug-visible', onPathDebugVisible);
        const unbindPathDebug = () => EventBus.removeListener('path-debug-visible', onPathDebugVisible);
        this.events.once('shutdown', unbindPathDebug);
        this.events.once('destroy', unbindPathDebug);

        // Initialize A* Pathfinding service with level air walls
        const pathfinder = new PathfindingService(this.level.imageSize, this.level.airWalls);

        // Editor-only visualisation of the grid + per-monster paths.
        // Stays hidden in production; toggled via the path-debug-visible
        // event from the editor's Air-walls section.
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
                    // Tavern mode: walk-onto-drop auto-pickup / auto-
                    // swap. Below cap the weapon slots in fresh; at
                    // cap the active slot is replaced and the old
                    // weapon pops out as a parabola drop the player
                    // can pick back up. 专武 / locked slots block the
                    // auto-swap — the drop stays on the ground so the
                    // player can sidestep the locked slot by switching
                    // to an empty one first.
                    if (this.level.tavern) {
                        const weapons = this.character.weapons;
                        if (!weapons) return true;

                        const result = this.character.tryPickupWeaponById(
                            weaponId,
                            this.assets.weaponsById,
                        );
                        if (result === 'added') {
                            this.tavernController?.notifyWeaponAdded();
                            return true;
                        }
                        if (result === 'capped') {
                            const activeIdx = weapons.getActiveIndex();
                            if (this.tavernController?.isSlotLocked(activeIdx, this.character)) {
                                // Active slot is 专武 — can't auto-
                                // replace. Leave the drop on the
                                // ground; player can switch slots with
                                // 1/2/3 and walk back onto it.
                                return false;
                            }
                            const replacedSlot = weapons.getSlot(activeIdx);
                            const newSpec = this.assets.weaponsById.get(weaponId);
                            if (!replacedSlot || !newSpec) return false;
                            // Drop the replaced weapon as a parabola
                            // before swapping, so the old gun lands
                            // behind the player as the new one slots
                            // in.
                            const dropSpec = this.assets.dropSpecs.get('weapon-drop');
                            const charPos = this.character.body?.position;
                            if (dropSpec && charPos) {
                                this.dropSystem?.spawnWeapon(
                                    dropSpec,
                                    replacedSlot.spec,
                                    charPos.x,
                                    charPos.y,
                                );
                            }
                            weapons.replaceSlot(activeIdx, newSpec);
                            return true;
                        }
                        // 'unknown' — bail without consuming.
                        return false;
                    }
                    this.character.pickUpWeapon(weaponId);
                    return true;
                },
            },
            (id) => this.assets.weaponsById.get(id),
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
                const weapon = this.character.weapons;
                if (!weapon) continue;
                const active = weapon.getActive();
                if (!active) continue;
                this.monsterSystem.applyBulletDamage(active.damage, other);
            }
        });

        // Inject the player's luck so applyBulletDamage uses the correct
        // crit chance from scene start. Defaults to 1 (10 % floor) when
        // the character spec omits luck.
        this.monsterSystem.setPlayerLuck(this.assets.character.luck ?? 1);

        // Wire AudioController (subscribes to EventBus sfx:*/music:* events).

        this.audio = new AudioController(
            this,
            this.assets.sfxSpecs.values(),
            this.assets.musicSpecs.values(),
        );
        // Honk the level's chosen music, if any. If the level has no music
        // the global BGM from the previous scene is silenced — the
        // singleton survives scene transitions, so without this stop
        // any old music would keep playing into a silent scene.
        if (this.level.music) {
            EventBus.emit(MUSIC_EVENT(this.level.music));
        } else {
            EventBus.emit(MUSIC_STOP);
        }

        // Center camera on world so the viewport shows the middle of the
        // level when the browser window is smaller than the image.
        this.cameras.main.centerOn(this.level.imageSize.width / 2, this.level.imageSize.height / 2);

        // Per-frame monster tick & material Y-sorting & drop update.
        this.materialManager = new MaterialManager(this, this.level);

        // Optional Pixel Art Light & PostFX pipeline (enabled via PIXEL_LIGHTING_CONFIG.ENABLE or level YAML)
        if (isPixelLightingEnabled) {
            // 2. Apply Phaser 4 native filters: Pixelate + Quantize
            // (filters are scene-wide, applied unconditionally even during
            // tavern phase 1 — they're cheap and the look is the same
            // with or without a point light on the placeholder)
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

            // The pointlight is created LAZILY (createPlayerLight below)
            // — only after the real character is loaded. During tavern
            // phase 1 the placeholder has no sprite/shadow, so a
            // pointlight following its body would render a green orb at
            // the spawn point with nothing visible inside it. We avoid
            // that by not creating the light until F confirm (or on
            // refresh when `selectedCharacterId` is already set).
            if (!this.level.tavern) {
                this.createPlayerLight();
            }
        }

        // Wire TeleporterController (code-drawn magic circle & scene transition).
        // Position callback reads `this.character` lazily so a tavern
        // character swap on confirm picks up the new body automatically.
        // Tavern exit is always unblocked; other scenes block on monster clear.
        this.teleporterSystem = new TeleporterController(
            this,
            this.level.teleporters,
            this.id,
            () => (this.character?.body?.position ? this.character.body.position : null),
            () => (this.level.tavern ? true : this.monsterSystem.isAllCleared()),
        );

        this.events.on('update', (_time: number, delta: number) => {
            this.monsterSystem.update(this.time.now);
            this.pathDebugOverlay.refresh(this.monsterSystem.getDebugMonsters(), this.character.body);
            this.dropSystem.update();
            this.materialManager.update();
            this.teleporterSystem.update(delta);
            // Publish the character's world position so the React
            // WeaponReplaceHub can anchor next to them. 1 event per
            // frame is fine — the hub only mounts while the cap-
            // replace UI is open, so when nothing's happening no
            // listener is attached.
            const body = this.character?.body;
            if (body?.position) {
                EventBus.emit('character-position', { x: body.position.x, y: body.position.y });
            }
            // Persist clock + entity snapshots to the UI store (1Hz).
            this.tickSaveState();

            // Victory check: if this level is the final level in index.yaml,
            // and all monsters + pending waves are cleared, trigger victory!
            this.checkVictory();
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

        // ── Tavern UI overlay ──────────────────────────────────────────
        // Two cases:
        //   1. First visit (selectedCharacterId === null): placeholder +
        //      TavernController (phase 1 NPC selection).
        //   2. Returning visit (selectedCharacterId !== null): player
        //      already chose — load the picked spec directly as the
        //      real character, skip the selection UI. The character
        //      renders immediately at the spawn point so the player
        //      doesn't see NPCs instead of their character on refresh.
        if (this.level.tavern) {
            const selectedId = useGameStore.getState().selectedCharacterId;
            if (selectedId !== null) {
                // Find the previously-selected spec from allCharacters
                // (or fall back to the default) and rebuild the scene's
                // character + subsystems around it. We clear the stale
                // `playerSnapshot` so the real character spawns at the
                // level's default (image center) instead of an off-world
                // position left behind by a previous session's
                // placeholder snapshot.
                const allChars = this.assets.allCharacters ?? [];
                const pickedSpec =
                    allChars.find((c) => c.id === selectedId) ??
                    this.assets.character;
                this.character.destroy();
                (this.assets as any).character = pickedSpec;
                if (pickedSpec.sprite) {
                    (this.assets as any).spriteCell = { width: 128, height: 128 };
                }
                // Clear only monster / drop snapshots — DO NOT clear
                // playerSnapshot. loadCharacter() reads it to restore
                // the player's last walked position on refresh; the
                // tavern refresh path should behave like every other
                // level and keep position continuity.
                useGameStore.setState({
                    activeMonstersSnapshot: undefined,
                    groundDropsSnapshot: undefined,
                });
                this.character = loadCharacter(
                    this,
                    this.level,
                    pickedSpec,
                    this.assets.weapons,
                    {
                        weaponsById: this.assets.weaponsById,
                    },
                );
                this.monsterSystem.setPlayerBody(this.character.body);
                this.monsterSystem.setPlayerLuck(pickedSpec.luck ?? 1);
                this.dropSystem.setCharacter(this.character);
                useGameStore.getState().setHubsVisible(true);
                // tavernCleared is already true from the previous run.
                // Mount the pointlight now that the real character is
                // loaded — phase 1 was deliberately lightless because the
                // placeholder has no sprite/shadow to float around.
                this.createPlayerLight();

                // Spawn a pickup-only TavernController so the
                // weapon-replace-hub still works after refresh (the
                // default branch skips it because the player already
                // chose a character).
                this.tavernController = new TavernController(
                    this,
                    this.level,
                    this.assets,
                    () => {
                        /* no-op — selection phase is not active */
                    },
                    'pickup',
                );
            } else {
                this.tavernController = new TavernController(
                    this,
                    this.level,
                    this.assets,
                    (selectedSpec: CharacterSpec, spawnPos: { x: number; y: number }) => {
                        this.character.destroy();
                        (this.assets as any).character = selectedSpec;
                        if (selectedSpec.sprite) {
                            (this.assets as any).spriteCell = {
                                width: 128,
                                height: 128,
                            };
                        }
                        this.character = loadCharacter(
                            this,
                            this.level,
                            selectedSpec,
                            this.assets.weapons,
                            { weaponsById: this.assets.weaponsById, spawnOverride: spawnPos },
                        );
                        // Rewire subsystems to the freshly-spawned
                        // character's body / runtime. monsterSystem
                        // tracks the body for player-hit detection;
                        // dropSystem holds the runtime reference for
                        // magnet + pickup collision + heal/ ammo
                        // callbacks. Both were captured against the
                        // placeholder.
                        this.monsterSystem.setPlayerBody(this.character.body);
                        this.monsterSystem.setPlayerLuck(selectedSpec.luck ?? 1);
                        this.dropSystem.setCharacter(this.character);
                        // Phase 1 hidden the React HUDs
                        // (CharacterHud.setVisible → setHubsVisible
                        // (false)); restore them for phase 2 so the
                        // new character's weapon/HP/EXP panels come
                        // back.
                        useGameStore.getState().setHubsVisible(true);
                        useGameStore.getState().setTavernCleared(true);
                        // Mount the pointlight now that the real
                        // character body is in place. Phase 1 was
                        // deliberately lightless so the placeholder's
                        // invisible body wouldn't render a green orb.
                        this.createPlayerLight();
                    },
                );
            }

            // (Auto-swap on cap lives in the dropSystem's onWeaponPickup
            // callback above — no separate hub event handler needed.)
        }
    }

    private isShutdown = false;

    shutdown(): void {
        // Phaser fires both 'shutdown' AND 'destroy' on some paths
        // and only 'destroy' on scene.remove(). The once() bindings
        // above would still run this twice in the first case if the
        // subsystems aren't idempotent — guard so each subsystem is
        // torn down exactly once.
        if (this.isShutdown) return;
        this.isShutdown = true;
        this.tavernController?.destroy();
        this.teleporterSystem?.destroy();
        this.audio?.destroy();
        this.pathDebugOverlay?.destroy();
    }

    private checkVictory(): void {
        const store = useGameStore.getState();
        if (store.isVictory || store.isDead) return;
        if (this.level.tavern) return;

        // Verify if this is the final level in index.yaml
        fetchLevelIndex()
            .then((indexManifest) => {
                const levels = indexManifest.levels;
                if (!levels || levels.length === 0) return;
                const lastLevelId = levels[levels.length - 1];
                if (this.id === lastLevelId) {
                    if (this.monsterSystem.isAllCleared()) {
                        // Trigger Victory!
                        store.setVictory(true);
                        EventBus.emit(SFX_EVENT('victory'));
                        this.scene.pause();
                    }
                }
            })
            .catch(() => {
                /* ignore manifest fetch error */
            });
    }

    /**
     * Mount the player-following pointlight and register a per-frame
     * listener that tracks the current `this.character.body.position`.
     * Called once after the real character is loaded — non-tavern
     * scenes at the end of `create()`, tavern scenes after F confirm
     * (or on refresh when `selectedCharacterId` is already set).
     *
     * Why lazy: during tavern phase 1, the placeholder has no sprite
     * or shadow to anchor the light to. A static-body-following
     * pointlight would render a green orb at the spawn point with a
     * dark centre (the "ghost" character effect). Deferring creation
     * until the real character loads eliminates that visual.
     *
     * The listener closes over `playerLight` and reads
     * `this.character.body` each frame, so character swaps on confirm
     * don't need to re-register — the body reference updates
     * transparently.
     */
    private createPlayerLight(): void {
        const body = this.character?.body;
        if (!body?.position) return;
        const playerLight = (this.add as any).pointlight(
            body.position.x,
            body.position.y,
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
        this.events.on('update', () => {
            const liveBody = this.character?.body;
            if (liveBody?.position && playerLight) {
                playerLight.setPosition(liveBody.position.x, liveBody.position.y);
            }
        });
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
