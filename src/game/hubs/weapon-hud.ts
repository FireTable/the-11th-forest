/**
 * src/game/hubs/weapon-hud.ts
 * --------------------------------------------------------------------------
 * Bottom-right HUD: 3-slot hotbar (1/2/3), active slot highlighted,
 * ammo counter (current / max), weapon name, reload progress bar.
 *
 * Passive view — character.ts pulls state via WeaponController.getters each
 * frame and calls draw(). Nothing in the HUD writes back.
 *
 * Anchored in screen-pixel space via `BaseHud`.
 */

import * as Phaser from 'phaser';

import {
    HUD_BAR_BG,
    HUD_BAR_TRACK_ALPHA,
    HUD_FILL_ALPHA,
    HUD_FONT_AMMO_BIG,
    HUD_FONT_LABEL,
    HUD_FONT_SLOT_KEY,
    HUD_FONT_WEAPON_NAME,
    HUD_PANEL_BG,
    HUD_PANEL_BORDER_ALPHA,
    HUD_PANEL_RADIUS,
    HUD_RELOAD_FILL,
    HUD_SLOT_ACTIVE_BORDER,
    HUD_SLOT_ACTIVE_FILL,
    HUD_SLOT_INACTIVE_BORDER,
    HUD_SLOT_INACTIVE_FILL,
    HUD_TEXT_ACTIVE,
    HUD_TEXT_AMMO_BIG,
    HUD_TEXT_AMMO_SMALL,
    HUD_TEXT_DIM,
    HUD_TEXT_LABEL,
    HUD_TEXT_WEAPON_NAME,
    HUD_WEAPON_AMMO_BAR_H,
    HUD_WEAPON_AMMO_BAR_INSET,
    HUD_WEAPON_AMMO_BAR_X,
    HUD_WEAPON_AMMO_BAR_Y,
    HUD_WEAPON_AMMO_BIG_OFFSET_Y,
    HUD_WEAPON_AMMO_MAX_OFFSET_Y,
    HUD_WEAPON_PANEL_ALPHA,
    HUD_WEAPON_PANEL_H,
    HUD_WEAPON_PANEL_PADDING,
    HUD_WEAPON_PANEL_W,
    HUD_WEAPON_SLOT_AMMO_OFFSET_X,
    HUD_WEAPON_SLOT_AMMO_OFFSET_Y,
    HUD_WEAPON_SLOT_BORDER_ACTIVE,
    HUD_WEAPON_SLOT_BORDER_INACTIVE,
    HUD_WEAPON_SLOT_BOTTOM_GAP,
    HUD_WEAPON_SLOT_GAP,
    HUD_WEAPON_SLOT_KEY_OFFSET_X,
    HUD_WEAPON_SLOT_KEY_OFFSET_Y,
    HUD_WEAPON_SLOT_LABEL_OFFSET_Y,
    HUD_WEAPON_SLOT_OFFSET_X,
    HUD_WEAPON_SLOT_SIZE,
    HUD_WEAPON_TEXT_PAD_X,
    HUD_WEAPON_TEXT_PAD_Y_TOP,
} from '@/lib/constants';
import type { WeaponSpec } from '@/lib/weapons';

import type { WeaponController } from '@/game/weapons/logic';

import { BaseHud } from './base-hub';

const SLOT_Y = HUD_WEAPON_PANEL_H - HUD_WEAPON_SLOT_SIZE - HUD_WEAPON_SLOT_BOTTOM_GAP;

interface SlotVisual {
    bg: Phaser.GameObjects.Graphics;
    border: Phaser.GameObjects.Graphics;
    label: Phaser.GameObjects.Text;
    ammo: Phaser.GameObjects.Text;
    key: Phaser.GameObjects.Text;
}

interface SlotState {
    spec: WeaponSpec;
    ammo: number;
}

export class WeaponHud extends BaseHud {
    private readonly panel: Phaser.GameObjects.Graphics;
    private readonly weaponName: Phaser.GameObjects.Text;
    private readonly ammoBig: Phaser.GameObjects.Text;
    private readonly ammoMax: Phaser.GameObjects.Text;
    private readonly reloadFill: Phaser.GameObjects.Graphics;
    private readonly reloadBg: Phaser.GameObjects.Graphics;
    private readonly slots: SlotVisual[] = [];

    constructor(scene: Phaser.Scene, weapons: WeaponController) {
        const displayW = scene.scale.displaySize.width;
        const displayH = scene.scale.displaySize.height;
        super(
            scene,
            displayW - HUD_WEAPON_PANEL_W - HUD_WEAPON_PANEL_PADDING,
            displayH - HUD_WEAPON_PANEL_H - HUD_WEAPON_PANEL_PADDING,
        );

        // Background panel
        this.panel = scene.add.graphics();
        this.panel.fillStyle(HUD_PANEL_BG, HUD_WEAPON_PANEL_ALPHA);
        this.panel.fillRoundedRect(0, 0, HUD_WEAPON_PANEL_W, HUD_WEAPON_PANEL_H, HUD_PANEL_RADIUS);
        this.panel.lineStyle(1, HUD_BAR_BG, HUD_PANEL_BORDER_ALPHA);
        this.panel.strokeRoundedRect(0, 0, HUD_WEAPON_PANEL_W, HUD_WEAPON_PANEL_H, HUD_PANEL_RADIUS);
        this.root.add(this.panel);

        // Weapon name (top-left of panel)
        this.weaponName = scene.add.text(HUD_WEAPON_TEXT_PAD_X, HUD_WEAPON_TEXT_PAD_Y_TOP, '', {
            fontFamily: 'monospace',
            fontSize: HUD_FONT_WEAPON_NAME,
            color: HUD_TEXT_WEAPON_NAME,
        });
        this.root.add(this.weaponName);

        // Ammo counter (top-right of panel)
        this.ammoBig = scene.add
            .text(HUD_WEAPON_PANEL_W - HUD_WEAPON_TEXT_PAD_X, HUD_WEAPON_AMMO_BIG_OFFSET_Y, '00', {
                fontFamily: 'monospace',
                fontSize: HUD_FONT_AMMO_BIG,
                color: HUD_TEXT_AMMO_BIG,
                fontStyle: 'bold',
            })
            .setOrigin(1, 0);
        this.ammoMax = scene.add.text(
            HUD_WEAPON_PANEL_W - HUD_WEAPON_TEXT_PAD_X,
            HUD_WEAPON_AMMO_MAX_OFFSET_Y,
            '/ 00',
            {
                fontFamily: 'monospace',
                fontSize: HUD_FONT_SLOT_KEY,
                color: HUD_TEXT_DIM,
            },
        );
        this.ammoMax.setOrigin(1, 0);
        this.root.add(this.ammoBig);
        this.root.add(this.ammoMax);

        // Reload progress bar
        this.reloadBg = scene.add.graphics();
        this.reloadFill = scene.add.graphics();
        this.root.add(this.reloadBg);
        this.root.add(this.reloadFill);

        // Hotbar slots
        const slotCount = weapons.getSlotCount();
        for (let i = 0; i < slotCount; i++) {
            const bg = scene.add.graphics();
            const border = scene.add.graphics();
            const key = scene.add.text(0, 0, String(i + 1), {
                fontFamily: 'monospace',
                fontSize: HUD_FONT_SLOT_KEY,
                color: HUD_TEXT_DIM,
            });
            const ammo = scene.add.text(0, 0, '', {
                fontFamily: 'monospace',
                fontSize: HUD_FONT_SLOT_KEY,
                color: HUD_TEXT_AMMO_SMALL,
            });
            const label = scene.add.text(0, 0, '', {
                fontFamily: 'monospace',
                fontSize: HUD_FONT_LABEL,
                color: HUD_TEXT_LABEL,
            });
            this.root.add([bg, border, key, ammo, label]);
            this.slots.push({ bg, border, label, ammo, key });
        }

        this.draw(weapons, scene.time.now);
    }

    draw(weapons: WeaponController, time: number): void {
        const activeIdx = weapons.getActiveIndex();
        const active = weapons.getActive();
        const ammo = weapons.getAmmo();
        const max = weapons.getMaxAmmo();

        this.weaponName.setText(active.name);
        this.ammoBig.setText(String(ammo).padStart(2, '0'));
        this.ammoMax.setText(`/ ${max}`);

        // Reload bar
        this.reloadBg.clear();
        this.reloadFill.clear();
        const reloading = weapons.isReloading();
        if (reloading) {
            const frac = weapons.getReloadProgress(time);
            this.reloadBg.fillStyle(HUD_BAR_BG, HUD_BAR_TRACK_ALPHA);
            this.reloadBg.fillRect(
                HUD_WEAPON_AMMO_BAR_X,
                HUD_WEAPON_AMMO_BAR_Y,
                HUD_WEAPON_PANEL_W - HUD_WEAPON_AMMO_BAR_INSET,
                HUD_WEAPON_AMMO_BAR_H,
            );
            this.reloadFill.fillStyle(HUD_RELOAD_FILL, HUD_FILL_ALPHA);
            this.reloadFill.fillRect(
                HUD_WEAPON_AMMO_BAR_X,
                HUD_WEAPON_AMMO_BAR_Y,
                (HUD_WEAPON_PANEL_W - HUD_WEAPON_AMMO_BAR_INSET) * frac,
                HUD_WEAPON_AMMO_BAR_H,
            );
        }

        // Slots
        for (let i = 0; i < this.slots.length; i++) {
            const slot = this.slots[i];
            const state: SlotState = weapons.getSlot(i);
            const isActive = i === activeIdx;
            const slotX =
                HUD_WEAPON_SLOT_OFFSET_X +
                i * (HUD_WEAPON_SLOT_SIZE + HUD_WEAPON_SLOT_GAP);

            slot.bg.clear();
            slot.bg.fillStyle(
                isActive ? HUD_SLOT_ACTIVE_FILL : HUD_SLOT_INACTIVE_FILL,
                HUD_FILL_ALPHA,
            );
            slot.bg.fillRect(slotX, SLOT_Y, HUD_WEAPON_SLOT_SIZE, HUD_WEAPON_SLOT_SIZE);

            slot.border.clear();
            slot.border.lineStyle(
                isActive ? HUD_WEAPON_SLOT_BORDER_ACTIVE : HUD_WEAPON_SLOT_BORDER_INACTIVE,
                isActive ? HUD_SLOT_ACTIVE_BORDER : HUD_SLOT_INACTIVE_BORDER,
                1,
            );
            slot.border.strokeRect(slotX, SLOT_Y, HUD_WEAPON_SLOT_SIZE, HUD_WEAPON_SLOT_SIZE);

            slot.key.setPosition(
                slotX + HUD_WEAPON_SLOT_KEY_OFFSET_X,
                SLOT_Y + HUD_WEAPON_SLOT_KEY_OFFSET_Y,
            );
            slot.key.setColor(isActive ? HUD_TEXT_ACTIVE : HUD_TEXT_DIM);

            slot.label.setText(state.spec.name.slice(0, 4));
            slot.label.setPosition(
                slotX + HUD_WEAPON_SLOT_SIZE / 2,
                SLOT_Y + HUD_WEAPON_SLOT_SIZE / 2 + HUD_WEAPON_SLOT_LABEL_OFFSET_Y,
            );

            slot.ammo.setText(`${state.ammo}/${state.spec.clipSize}`);
            slot.ammo.setOrigin(1, 0);
            slot.ammo.setPosition(
                slotX + HUD_WEAPON_SLOT_SIZE + HUD_WEAPON_SLOT_AMMO_OFFSET_X,
                SLOT_Y + HUD_WEAPON_SLOT_SIZE + HUD_WEAPON_SLOT_AMMO_OFFSET_Y,
            );
        }
    }
}
