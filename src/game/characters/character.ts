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
    weapons: WeaponController;
    hud: CharacterHud;
    weaponHud: WeaponHud;
    statusHud: StatusHud;
    debugBodyRect: Phaser.GameObjects.Rectangle;
    /** Apply HP/SP healing (clamped to [0, max]). Negative values damage. */
    heal(hpDelta: number, spDelta: number): void;
    /** Add `fraction * currentWeaponClipSize` bullets to the active weapon. */
    refillAmmo(fraction: number): void;
    /** Switch to a named weapon if it's in the hotbar. No-op if not present. */
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

/**
 * Spawn a player Character at the level center. Returns the runtime API;
 * the controller's per-frame tick is wired up in the constructor.
 */
export function loadCharacter(
    scene: Phaser.Scene,
    level: Level,
    spec: CharacterSpec,
    weapons: WeaponSpec[],
): CharacterRuntime {
    // Per-level override (characterSpawn) takes priority over the image-center
    // default. Levels without a spawn entry still default to center / right.
    const spawnX = level.characterSpawn?.x ?? level.imageSize.width / 2;
    const spawnY = level.characterSpawn?.y ?? level.imageSize.height / 2;

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
    // The controller's update loop flips this every frame from the cursor,
    // but until the first pointermove fires we want the spawn pose to win.
    sprite.setFlipX((level.characterSpawn?.facing ?? 'right') === 'left');

    const weaponsSys = new WeaponController(scene, matter, body, weapons);
    const hud = new CharacterHud(scene, spec);
    const weaponHud = new WeaponHud(scene, weaponsSys);
    const statusHud = new StatusHud(scene, body);

    const controller = new CharacterController(scene, level, spec, {
        body,
        sprite,
        shadow,
        debugBodyRect,
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
