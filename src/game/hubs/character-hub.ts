/**
 * src/game/hubs/character-hub.ts
 * --------------------------------------------------------------------------
 * Bottom-left HUD: name label + HP bar + SP bar.
 *
 * Passive view — load-character pulls current hp/sp each frame and calls
 * update(). Nothing in the HUD writes back.
 *
 * Anchored in screen-pixel space via `makeScreenAnchoredContainer` — see
 * hud-base.ts for the FIT-scale trick.
 */

import * as Phaser from 'phaser';

import type { CharacterSpec } from '@/lib/characters';

import { makeScreenAnchoredContainer } from './base-hub';

const PADDING = 12;
const BAR_W = 220;
const BAR_H = 14;
const BAR_GAP = 6;
const BG_PAD = 4;
const NAME_OFFSET = 4;

export class CharacterHud {
    private readonly root: Phaser.GameObjects.Container;
    private readonly bg: Phaser.GameObjects.Graphics;
    private readonly hpFill: Phaser.GameObjects.Graphics;
    private readonly spFill: Phaser.GameObjects.Graphics;
    private readonly label: Phaser.GameObjects.Text;

    constructor(scene: Phaser.Scene, spec: CharacterSpec) {
        const displayH = scene.scale.displaySize.height;
        const screenX = PADDING;
        const screenY = displayH - BAR_H * 2 - PADDING - 16;
        const { container } = makeScreenAnchoredContainer(scene, screenX, screenY);
        this.root = container;

        this.bg = scene.add.graphics();
        this.bg.fillStyle(0x000000, 0.5);
        this.bg.fillRect(-BG_PAD, -BG_PAD, BAR_W + BG_PAD * 2, BAR_H * 2 + BAR_GAP + 14 + BG_PAD);
        this.root.add(this.bg);

        this.label = scene.add.text(0, NAME_OFFSET, spec.name, {
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

    destroy(): void {
        this.root.destroy();
    }

    private draw(hp: number, maxHp: number, sp: number, maxSp: number): void {
        const hpY = 18;
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