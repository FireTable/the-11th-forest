/**
 * src/game/characters/character.ts
 * --------------------------------------------------------------------------
 * Player character module — owns *every* concern for the character:
 *
 *   1. Phaser resource loading      → loadCharacterAssets()
 *   2. Animation registration       → createCharacterAnims()
 *   3. Sprite + Matter body spawn   → loadCharacter()
 *   4. Per-frame input + behaviour  → CharacterController (./logic.ts)
 *   5. Key derivation               → textureKey() / animKey()
 *
 * The scene delegates here from its `preload()` / `create()` phases but
 * doesn't reach into the sprite / anims internals (per CLAUDE.md rule
 * 12: each module owns its own concerns).
 */

import * as Phaser from 'phaser';

import { CAT } from '@/lib/constants';
import type { AnimSpec, CharacterSpec } from '@/lib/characters';
import type { Level } from '@/lib/levels/types';
import type { WeaponSpec } from '@/lib/weapons';

import { CharacterHud } from '@/game/hubs/character-hub';
import { StatusHud } from '@/game/hubs/status-hud';
import { WeaponHud } from '@/game/hubs/weapon-hud';
import { WeaponController } from '@/game/weapons/logic';

import { CharacterController } from './logic';
import { animKey, textureKey } from './keys';

// ─── Public API ──────────────────────────────────────────────────────────

export interface CharacterRuntime {
    body: MatterJS.BodyType;
    sprite: Phaser.GameObjects.Sprite;
    /**
     * Null on the tavern placeholder (no weapons module spawned). The
     * placeholder has no body to attach weapons to and no collision
     * listener, so this null is a hard guarantee that no fire / hotbar /
     * collision listener fires during phase 1.
     */
    weapons: WeaponController | null;
    /**
     * Null on the placeholder (no React HUD writer spawned). Tavern
     * hides the character / weapon panels through hubsVisible instead.
     */
    hud: CharacterHud | null;
    weaponHud: WeaponHud | null;
    statusHud: StatusHud | null;
    debugBodyRect: Phaser.GameObjects.Rectangle | null;
    debugHitboxRect: Phaser.GameObjects.Rectangle | null;
    /** Apply HP/SP healing (clamped to [0, max]). Negative values damage.
     *  No-op on the placeholder (no controller to apply to). */
    heal(hpDelta: number, spDelta: number): void;
    /** Add `fraction * currentWeaponClipSize` bullets to the active weapon. */
    refillAmmo(fraction: number): void;
    /** Switch to a named weapon if it's in the hotbar. No-op if not present.
     *  Returns false on the placeholder. */
    pickUpWeapon(weaponId: string): boolean;
    update(time: number): void;
    destroy(): void;
}

/**
 * Queue the sprite-sheet texture load on the scene's loader. Caller MUST
 * invoke this from `preload()` — Phaser waits for queued loads to flush
 * before `create()` runs, which is what keeps `add.sprite(key, ...)`
 * safe to call from `create()`.
 *
 * `cellWidth` / `cellHeight` are derived from the texture's natural
 * size and the spec's grid layout by the caller (main.ts pre-fetches
 * the PNG header). This keeps the YAML free of resolution-coupled
 * frame dimensions.
 *
 * No-op when the spec lacks a `sprite` block (debug-rectangle fallback).
 */
export function loadCharacterAssets(
    scene: Pick<Phaser.Scene, 'load'>,
    spec: CharacterSpec,
    cellWidth: number,
    cellHeight: number,
): void {
    if (!spec.sprite) return;
    scene.load.spritesheet(textureKey(spec), spec.sprite.texture, {
        frameWidth: cellWidth,
        frameHeight: cellHeight,
    });
}

/**
 * Register every named animation track on the scene's animation manager.
 * Skipped when the spec has no `anims` block. Existing registrations
 * with the same key are removed first (HMR can leave a stale manager).
 */
export function createCharacterAnims(
    scene: Pick<Phaser.Scene, 'anims'>,
    spec: CharacterSpec,
): void {
    if (!spec.anims) return;
    for (const [name, anim] of Object.entries(spec.anims)) {
        registerAnim(scene, spec, name, anim);
    }
}

function registerAnim(
    scene: Pick<Phaser.Scene, 'anims'>,
    spec: CharacterSpec,
    name: string,
    anim: AnimSpec,
): void {
    const key = animKey(spec, name);
    if (scene.anims.exists(key)) scene.anims.remove(key);
    // Phaser 4 expects each AnimationFrame to carry a texture `key` and a
    // `frame` index. We resolve the texture key here once so the per-frame
    // records stay compact.
    const texture = textureKey(spec);
    const frames: Phaser.Types.Animations.AnimationFrame[] = [];
    for (let i = anim.frames[0]; i <= anim.frames[1]; i++) {
        frames.push({ key: texture, frame: i });
    }
    scene.anims.create({
        key,
        frames,
        frameRate: anim.frameRate,
        repeat: anim.repeat,
    });
}

import { useGameStore } from '@/store/game-store';

/**
 * Options for `loadCharacter`.
 *
 * `placeholder: true` skips the gameplay modules: WeaponController
 * (and therefore fire / hotbar / bullet collision listener), HUD
 * writers (CharacterHud / WeaponHud / StatusHud), debug rects, and
 * CharacterController (no keyboard / pointer / mobile input binding).
 * Used by the tavern selection UI as the default-character placeholder:
 * the sprite sits at the spawn point behind the selection UI, but no
 * fire / SFX / hotbar / input can fire. The placeholder is replaced
 * with a real character on confirm; `monsterSystem.setPlayerBody` and
 * `dropSystem.setCharacter` rewire to the new body / runtime.
 *
 * `ignoreSavedPosition: true` ignores `useGameStore.playerSnapshot` and
 * always uses the level's spawn point. Used when refreshing into the
 * tavern after a previous session's stale (off-world) snapshot would
 * otherwise place the character out of view.
 */
export interface LoadCharacterOptions {
    placeholder?: boolean;
    ignoreSavedPosition?: boolean;
}

/**
 * Spawn a player Character at the level center. Returns the runtime API;
 * the controller's per-frame tick is wired up in the constructor.
 *
 * When `opts.placeholder` is true, only the visual sprite + shadow +
 * idle animation + a parked Matter body are produced. The body is
 * parked far off-world so it never collides with anything during phase
 * 1 (subsystems still hold a non-null body ref they swap on confirm).
 * The runtime's `weapons`, `hud`, `weaponHud`, `statusHud`, and debug
 * rects are all null — the API methods (`heal`, `pickUpWeapon`, …) are
 * no-ops so subsystems holding the placeholder reference don't crash.
 */
export function loadCharacter(
    scene: Phaser.Scene,
    level: Level,
    spec: CharacterSpec,
    weapons: WeaponSpec[],
    opts: LoadCharacterOptions = {},
): CharacterRuntime {
    const savedPlayer = useGameStore.getState().playerSnapshot;
    // Saved position takes highest priority, then level characterSpawn,
    // then image center. `placeholder` and `ignoreSavedPosition` both
    // opt out of the saved snapshot — placeholders always sit at the
    // level spawn (a stale off-world snapshot would re-poison the store
    // via tickSaveState), and refreshes into the tavern (when the
    // player has already chosen a character) do the same so the
    // character doesn't spawn wherever the placeholder used to be.
    const useSaved =
        !opts.placeholder && !opts.ignoreSavedPosition;
    const spawnX = useSaved
        ? (savedPlayer?.x ?? level.characterSpawn?.x ?? level.imageSize.width / 2)
        : (level.characterSpawn?.x ?? level.imageSize.width / 2);
    const spawnY = useSaved
        ? (savedPlayer?.y ?? level.characterSpawn?.y ?? level.imageSize.height / 2)
        : (level.characterSpawn?.y ?? level.imageSize.height / 2);

    if (opts.placeholder) {
        // Visual-only placeholder for the tavern selection UI: a sprite
        // + shadow + idle animation, a static body at the spawn point
        // (so the 1Hz save snapshot records the real spawn coords), and
        // NO weapons / HUDs / controller. The "no weapons module" is the
        // whole point — phase 1 must not fire bullets, play weapon SFX,
        // bind 1/2/3 hotbar, or write to the React HUD store.
        //
        // `isStatic: true` is essential: a dynamic body can still
        // translate from collisions with the outer-boundary walls or
        // any future physics impulse, even with `setInertia(Infinity)`
        // (which only freezes rotation). Static bodies don't move
        // regardless of force, so the body stays put for the duration
        // of phase 1 and the 1Hz `tickSaveState` keeps recording the
        // spawn coords.
        const body = scene.matter.add.rectangle(
            spawnX,
            spawnY - spec.body.halfH,
            spec.body.halfW * 2,
            spec.body.halfH * 2,
            {
                isStatic: true,
                label: 'character',
                collisionFilter: {
                    category: CAT.CHARACTER,
                    mask: 0xffff & ~CAT.BULLET,
                },
            },
        );

        const shadow = scene.add.ellipse(
            spawnX,
            spawnY,
            spec.body.halfW * 2,
            spec.body.halfH * 0.8,
            0x000000,
            0.35,
        );
        const sprite = scene.add.sprite(spawnX, spawnY, textureKey(spec));
        sprite.setOrigin(0.5, 1.0);
        if (spec.sprite) sprite.setScale(spec.sprite.scale);
        sprite.setFlipX((level.characterSpawn?.facing ?? 'right') === 'left');
        if (spec.anims) {
            const idleKey = animKey(spec, 'idle');
            if (scene.anims.exists(idleKey)) sprite.anims.play(idleKey, true);
        }
        return {
            body,
            sprite,
            weapons: null,
            hud: null,
            weaponHud: null,
            statusHud: null,
            debugBodyRect: null,
            debugHitboxRect: null,
            heal: () => {
                /* placeholder: no controller */
            },
            refillAmmo: () => {
                /* placeholder: no controller */
            },
            pickUpWeapon: () => false,
            update: () => {
                /* placeholder: no controller */
            },
            destroy: () => {
                scene.matter.world.remove(body);
                shadow.destroy();
                sprite.destroy();
            },
        };
    }

    const body = scene.matter.add.rectangle(
        // Body center sits halfH above the spawn point so the body's
        // bottom edge lands exactly on the sprite's feet — top-down
        // characters collide at their feet, not their geometric centre.
        spawnX,
        spawnY - spec.body.halfH,
        spec.body.halfW * 2,
        spec.body.halfH * 2,
        {
            label: 'character',
            collisionFilter: {
                category: CAT.CHARACTER,
                // Mask all EXCEPT bullets — player bullets spawn from inside
                // the body so they must not self-collide.
                mask: 0xffff & ~CAT.BULLET,
            },
        },
    );

    const matter = (Phaser as any).Physics.Matter.Matter;
    matter.Body.setInertia(body, Infinity);

    // Visual: debug body rectangle (green outline) matching Matter body exactly
    const debugBodyRect = scene.add.rectangle(
        spawnX,
        spawnY - spec.body.halfH,
        spec.body.halfW * 2,
        spec.body.halfH * 2,
        0x22c55e,
        0.25,
    );
    debugBodyRect.setStrokeStyle(1.5, 0x22c55e, 0.9);
    debugBodyRect.setVisible(false);

    // Visual: debug hitbox rectangle (red outline) matching full Sprite
    const debugHitboxRect = scene.add.rectangle(
        spawnX,
        spawnY - spec.body.halfH,
        spec.body.halfW * 2,
        spec.body.halfH * 2,
        0xef4444,
        0.25,
    );
    debugHitboxRect.setStrokeStyle(1.5, 0xef4444, 0.9);
    debugHitboxRect.setVisible(false);

    // Visual: shadow under feet based on spec.body halfW / halfH
    const shadow = scene.add.ellipse(
        spawnX,
        spawnY,
        spec.body.halfW * 2,
        spec.body.halfH * 0.8,
        0x000000,
        0.35,
    );

    // Visual: sprite-sheet frame from the character's loaded texture.
    // The matter body controls collisions; the sprite is purely visual.
    // Anchor at (0.5, 1.0) so `sprite.position` represents the FEET,
    // matching the body's bottom edge.
    const sprite = scene.add.sprite(spawnX, spawnY, textureKey(spec));
    sprite.setOrigin(0.5, 1.0);
    if (spec.sprite) sprite.setScale(spec.sprite.scale);
    // Seed initial facing from the level's spawn config (default right).
    sprite.setFlipX((level.characterSpawn?.facing ?? 'right') === 'left');

    if (spec.sprite) {
        const spriteW = sprite.displayWidth;
        const spriteH = sprite.displayHeight;
        debugHitboxRect.setSize(spriteW, spriteH);

        // Attach sensor Hitbox covering full Character Sprite
        const spriteHitbox = matter.Bodies.rectangle(
            spawnX,
            spawnY - spriteH / 2,
            spriteW,
            spriteH,
            {
                isSensor: true,
                label: 'character-hitbox',
                collisionFilter: {
                    category: CAT.CHARACTER,
                    mask: 0xffff & ~CAT.BULLET,
                },
            },
        );
        const compoundBody = matter.Body.create({
            parts: [body, spriteHitbox],
            inertia: Infinity,
            label: 'character',
            collisionFilter: {
                category: CAT.CHARACTER,
                mask: 0xffff & ~CAT.BULLET,
            },
        });
        scene.matter.world.add(compoundBody);
    }

    const weaponsSys = new WeaponController(scene, matter, body, weapons);
    const hud = new CharacterHud(scene, spec);
    const weaponHud = new WeaponHud(scene, weaponsSys);
    const statusHud = new StatusHud(scene, body);

    const controller = new CharacterController(scene, level, spec, {
        body,
        sprite,
        shadow,
        debugBodyRect,
        debugHitboxRect,
        matter,
        weapons: weaponsSys,
        hud,
        weaponHud,
        statusHud,
    });

    // Kick off the default (idle) animation if any was declared and
    // registered by createCharacterAnims(). The controller's update loop
    // will keep the right anim playing as movement state changes.
    if (spec.anims) {
        const idleKey = animKey(spec, 'idle');
        if (scene.anims.exists(idleKey)) sprite.anims.play(idleKey, true);
    }

    return {
        body,
        sprite,
        weapons: weaponsSys,
        hud,
        weaponHud,
        statusHud,
        debugBodyRect,
        debugHitboxRect,
        heal: (hp, sp) => controller.heal(hp, sp),
        refillAmmo: (f) => controller.refillAmmo(f),
        pickUpWeapon: (id) => controller.pickUpWeapon(id),
        // Controller self-registers with scene.events.on('update'); this
        // method is kept for forward compat (callers that want to drive
        // ticks manually).
        update: () => controller['update'](scene.time.now),
        destroy: () => controller.destroy(),
    };
}
