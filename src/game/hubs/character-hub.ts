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

import type { CharacterSpec } from '@/lib/characters';

import { BaseHud } from './base-hub';

// Distance from screen bottom for both character-hub + weapon-hud.
// Change in one place to keep them aligned.
const BOTTOM_GAP = 14;

const PADDING_X = 12;
const BG_PAD = 4;
const BAR_W = 220;
const BAR_H = 14;
const BAR_GAP = 6;
const NAME_OFFSET_Y = 4;

// Total HUD height = top BG_PAD + label area + HP + gap + SP + bottom BG_PAD.
// label area = NAME_OFFSET_Y + ~12px font (rounded up to 14 for safe padding).
const LABEL_AREA = NAME_OFFSET_Y + 14;
const HUD_HEIGHT = BG_PAD + LABEL_AREA + BAR_H + BAR_GAP + BAR_H + BG_PAD;

export class CharacterHud extends BaseHud {
    private readonly bg: Phaser.GameObjects.Graphics;
    private readonly hpFill: Phaser.GameObjects.Graphics;
    private readonly spFill: Phaser.GameObjects.Graphics;
    private readonly label: Phaser.GameObjects.Text;

    constructor(scene: Phaser.Scene, spec: CharacterSpec) {
        const displayH = scene.scale.displaySize.height;
        super(scene, PADDING_X, displayH - HUD_HEIGHT - BOTTOM_GAP);

        this.bg = scene.add.graphics();
        this.bg.fillStyle(0x000000, 0.5);
        this.bg.fillRect(-BG_PAD, -BG_PAD, BAR_W + BG_PAD * 2, HUD_HEIGHT);
        this.root.add(this.bg);

        this.label = scene.add.text(0, NAME_OFFSET_Y, spec.name, {
            fontFamily: 'monospace',
            fontSize: '12px',
            color: '#86efac',
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
        const hpY = LABEL_AREA + BG_PAD;
        const spY = hpY + BAR_H + BAR_GAP;

        this.hpFill.clear();
        this.hpFill.fillStyle(0x1f2937, 0.85);
        this.hpFill.fillRect(0, hpY, BAR_W, BAR_H);
        this.hpFill.fillStyle(0x22c55e, 0.95);
        const hpFrac = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
        this.hpFill.fillRect(0, hpY, BAR_W * hpFrac, BAR_H);

        this.spFill.clear();
        this.spFill.fillStyle(0x1f2937, 0.85);
        this.spFill.fillRect(0, spY, BAR_W, BAR_H);
        this.spFill.fillStyle(0x38bdf8, 0.95);
        const spFrac = maxSp > 0 ? Math.max(0, Math.min(1, sp / maxSp)) : 0;
        this.spFill.fillRect(0, spY, BAR_W * spFrac, BAR_H);
    }
}