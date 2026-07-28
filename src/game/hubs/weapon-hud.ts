/**
 * src/game/hubs/weapon-hud.ts
 * --------------------------------------------------------------------------
 * Bottom-right HUD: 3-slot hotbar (1/2/3), active slot highlighted,
 * ammo counter (current / max), weapon name, reload progress bar.
 *
 * Passive view — character.ts pulls state via WeaponController.getters each
 * frame and calls draw(). Nothing in the HUD writes back.
 *
 * Anchored in screen-pixel space via `makeScreenAnchoredContainer` — see
 * hud-base.ts for the FIT-scale trick.
 */

import * as Phaser from 'phaser';

import type { WeaponSpec } from '@/lib/weapons';

import type { WeaponController } from '@/game/weapons/logic';

import { makeScreenAnchoredContainer } from './base-hub';

const PADDING = 14;
const PANEL_W = 244;
const PANEL_H = 116;
const SLOT_SIZE = 56;
const SLOT_GAP = 8;
const SLOT_Y = PANEL_H - SLOT_SIZE - 8;
const SLOT_OFFSET_X = 12;
const AMMO_BAR_Y = 32;
const AMMO_BAR_H = 6;

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

export class WeaponHud {
    private readonly root: Phaser.GameObjects.Container;
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
        const { container } = makeScreenAnchoredContainer(
            scene,
            displayW - PANEL_W - PADDING,
            displayH - PANEL_H - PADDING,
        );
        this.root = container;

        // Background panel
        this.panel = scene.add.graphics();
        this.panel.fillStyle(0x000000, 0.55);
        this.panel.fillRoundedRect(0, 0, PANEL_W, PANEL_H, 8);
        this.panel.lineStyle(1, 0x1f2937, 0.9);
        this.panel.strokeRoundedRect(0, 0, PANEL_W, PANEL_H, 8);
        this.root.add(this.panel);

        // Weapon name (top-left of panel)
        this.weaponName = scene.add.text(12, 8, '', {
            fontFamily: 'monospace',
            fontSize: '13px',
            color: '#fde68a',
        });
        this.root.add(this.weaponName);

        // Ammo counter (top-right of panel)
        this.ammoBig = scene.add
            .text(PANEL_W - 12, 6, '00', {
                fontFamily: 'monospace',
                fontSize: '22px',
                color: '#fef3c7',
                fontStyle: 'bold',
            })
            .setOrigin(1, 0);
        this.ammoMax = scene.add.text(PANEL_W - 12, 32, '/ 00', {
            fontFamily: 'monospace',
            fontSize: '11px',
            color: '#94a3b8',
        });
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
                fontSize: '11px',
                color: '#94a3b8',
            });
            const ammo = scene.add.text(0, 0, '', {
                fontFamily: 'monospace',
                fontSize: '11px',
                color: '#e2e8f0',
            });
            const label = scene.add.text(0, 0, '', {
                fontFamily: 'monospace',
                fontSize: '10px',
                color: '#cbd5e1',
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
            this.reloadBg.fillStyle(0x1f2937, 0.85);
            this.reloadBg.fillRect(12, AMMO_BAR_Y, PANEL_W - 24, AMMO_BAR_H);
            this.reloadFill.fillStyle(0xfbbf24, 0.95);
            this.reloadFill.fillRect(12, AMMO_BAR_Y, (PANEL_W - 24) * frac, AMMO_BAR_H);
        }

        // Slots
        for (let i = 0; i < this.slots.length; i++) {
            const slot = this.slots[i];
            const state: SlotState = weapons.getSlot(i);
            const isActive = i === activeIdx;
            const slotX = SLOT_OFFSET_X + i * (SLOT_SIZE + SLOT_GAP);

            slot.bg.clear();
            slot.bg.fillStyle(isActive ? 0xfde68a : 0x1e293b, 0.95);
            slot.bg.fillRect(slotX, SLOT_Y, SLOT_SIZE, SLOT_SIZE);

            slot.border.clear();
            slot.border.lineStyle(isActive ? 2 : 1, isActive ? 0x92400e : 0x334155, 1);
            slot.border.strokeRect(slotX, SLOT_Y, SLOT_SIZE, SLOT_SIZE);

            slot.key.setPosition(slotX + 4, SLOT_Y + 2);
            slot.key.setColor(isActive ? '#92400e' : '#94a3b8');

            slot.label.setText(state.spec.name.slice(0, 4));
            slot.label.setPosition(slotX + SLOT_SIZE / 2, SLOT_Y + SLOT_SIZE / 2 - 4);

            slot.ammo.setText(`${state.ammo}/${state.spec.clipSize}`);
            slot.ammo.setOrigin(1, 0);
            slot.ammo.setPosition(slotX + SLOT_SIZE - 4, SLOT_Y + SLOT_SIZE - 14);
        }
    }

    destroy(): void {
        this.root.destroy();
    }
}