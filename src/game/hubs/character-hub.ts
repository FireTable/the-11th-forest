/**
 * src/game/hubs/character-hub.ts
 * --------------------------------------------------------------------------
 * Bottom-left HUD: name label + HP bar + SP bar.
 *
 * Passive view — character.ts pulls current hp/sp each frame and calls
 * update(). Nothing in the HUD writes back.
 *
 * Anchored in screen-pixel space via `BaseHud`. Bottom-aligned with
 * weapon-hud.ts via shared `BOTTOM_GAP` constant.
 */

import * as Phaser from 'phaser';

import {
    HUD_BAR_BG,
    HUD_BG_PAD,
    HUD_BG_ALPHA,
    HUD_BOTTOM_GAP,
    HUD_FILL_ALPHA,
    HUD_FONT_NAME,
    HUD_HP_BAR_GAP,
    HUD_HP_BAR_H,
    HUD_HP_BAR_W,
    HUD_HP_FILL,
    HUD_HP_NAME_OFFSET_Y,
    HUD_HP_PANEL_PADDING_X,
    HUD_PANEL_BG,
    HUD_PANEL_BG_ALPHA,
    HUD_SP_FILL,
    HUD_TEXT_NAME,
} from '@/lib/constants';
import type { CharacterSpec } from '@/lib/characters';

import { BaseHud } from './base-hub';

// Total HUD height = top BG_PAD + label area + HP + gap + SP + bottom BG_PAD.
// label area = NAME_OFFSET_Y + ~12px font (rounded up to 14 for safe padding).
const LABEL_AREA = HUD_HP_NAME_OFFSET_Y + 14;
const HUD_HEIGHT =
    HUD_BG_PAD + LABEL_AREA + HUD_HP_BAR_H + HUD_HP_BAR_GAP + HUD_HP_BAR_H + HUD_BG_PAD;

export class CharacterHud extends BaseHud {
    private readonly bg: Phaser.GameObjects.Graphics;
    private readonly hpFill: Phaser.GameObjects.Graphics;
    private readonly spFill: Phaser.GameObjects.Graphics;
    private readonly label: Phaser.GameObjects.Text;

    constructor(scene: Phaser.Scene, spec: CharacterSpec) {
        const displayH = scene.scale.displaySize.height;
        super(scene, HUD_HP_PANEL_PADDING_X, displayH - HUD_HEIGHT - HUD_BOTTOM_GAP);

        this.bg = scene.add.graphics();
        this.bg.fillStyle(HUD_PANEL_BG, HUD_PANEL_BG_ALPHA);
        this.bg.fillRect(
            -HUD_BG_PAD,
            -HUD_BG_PAD,
            HUD_HP_BAR_W + HUD_BG_PAD * 2,
            HUD_HEIGHT,
        );
        this.root.add(this.bg);

        this.label = scene.add.text(0, HUD_HP_NAME_OFFSET_Y, spec.name, {
            fontFamily: 'monospace',
            fontSize: HUD_FONT_NAME,
            color: HUD_TEXT_NAME,
        });
        this.root.add(this.label);

        this.hpFill = scene.add.graphics();
        this.spFill = scene.add.graphics();
        this.root.add(this.hpFill);
        this.root.add(this.spFill);

        this.draw(spec.hp, spec.hp, spec.sp, spec.sp);
    }

    update(spec: CharacterSpec, hp: number, sp: number): void {
        this.draw(hp, spec.hp, sp, spec.sp);
    }

    private draw(hp: number, maxHp: number, sp: number, maxSp: number): void {
        // Position bars inside the bg:
        //   bg top at y=0, label at y=NAME_OFFSET_Y
        //   HP bar starts just below label
        const hpY = LABEL_AREA + HUD_BG_PAD;
        const spY = hpY + HUD_HP_BAR_H + HUD_HP_BAR_GAP;

        this.hpFill.clear();
        this.hpFill.fillStyle(HUD_BAR_BG, HUD_BG_ALPHA);
        this.hpFill.fillRect(0, hpY, HUD_HP_BAR_W, HUD_HP_BAR_H);
        this.hpFill.fillStyle(HUD_HP_FILL, HUD_FILL_ALPHA);
        const hpFrac = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
        this.hpFill.fillRect(0, hpY, HUD_HP_BAR_W * hpFrac, HUD_HP_BAR_H);

        this.spFill.clear();
        this.spFill.fillStyle(HUD_BAR_BG, HUD_BG_ALPHA);
        this.spFill.fillRect(0, spY, HUD_HP_BAR_W, HUD_HP_BAR_H);
        this.spFill.fillStyle(HUD_SP_FILL, HUD_FILL_ALPHA);
        const spFrac = maxSp > 0 ? Math.max(0, Math.min(1, sp / maxSp)) : 0;
        this.spFill.fillRect(0, spY, HUD_HP_BAR_W * spFrac, HUD_HP_BAR_H);
    }
}
