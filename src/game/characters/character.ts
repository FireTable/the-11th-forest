/**
 * src/game/characters/character.ts
 * --------------------------------------------------------------------------
 * Spawn a player Character. Pure wiring — constructs the Matter body +
 * visual + HUDs + weapon controller, then instantiates a CharacterController
 * (in `./logic`) which owns all input binding + per-frame behavior.
 *
 * The runtime returned is the public API: external code (LoadScene, drops)
 * uses `heal / refillAmmo / pickUpWeapon` and reads `body / weapons / hud`.
 */

import * as Phaser from 'phaser';

import { CAT } from '@/lib/constants';
import type { CharacterSpec } from '@/lib/characters';
import type { Level } from '@/lib/levels/types';
import type { WeaponSpec } from '@/lib/weapons';

import { CharacterHud } from '@/game/hubs/character-hub';
import { StatusHud } from '@/game/hubs/status-hud';
import { WeaponHud } from '@/game/hubs/weapon-hud';
import { WeaponController } from '@/game/weapons/logic';

import { CharacterController } from './logic';

const HALF_W = 16;
const HALF_H = 24;

export interface CharacterRuntime {
    body: MatterJS.BodyType;
    rect: Phaser.GameObjects.Rectangle;
    weapons: WeaponController;
    hud: CharacterHud;
    weaponHud: WeaponHud;
    statusHud: StatusHud;
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
 * Spawn a player Character at the level center. Returns the runtime API;
 * the controller's per-frame tick is wired up in the constructor.
 */
export function loadCharacter(
    scene: Phaser.Scene,
    level: Level,
    spec: CharacterSpec,
    weapons: WeaponSpec[],
): CharacterRuntime {
    const spawnX = level.imageSize.width / 2;
    const spawnY = level.imageSize.height / 2;

    const body = scene.matter.add.rectangle(spawnX, spawnY, HALF_W * 2, HALF_H * 2, {
        label: 'character',
        collisionFilter: {
            category: CAT.CHARACTER,
            // Mask all EXCEPT bullets — player bullets spawn from inside
            // the body so they must not self-collide.
            mask: 0xffff & ~CAT.BULLET,
        },
    });

    const rect = scene.add.rectangle(spawnX, spawnY, HALF_W * 2, HALF_H * 2, 0x22c55e, 0.85);
    rect.setStrokeStyle(2, 0x052e16, 1);

    const matter = (Phaser as any).Physics.Matter.Matter;
    const weaponsSys = new WeaponController(scene, matter, body, weapons);
    const hud = new CharacterHud(scene, spec);
    const weaponHud = new WeaponHud(scene, weaponsSys);
    const statusHud = new StatusHud(scene, body);

    const controller = new CharacterController(scene, level, spec, {
        body,
        rect,
        matter,
        weapons: weaponsSys,
        hud,
        weaponHud,
        statusHud,
    });

    return {
        body,
        rect,
        weapons: weaponsSys,
        hud,
        weaponHud,
        statusHud,
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