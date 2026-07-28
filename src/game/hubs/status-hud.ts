/**
 * src/game/hubs/status-hud.ts
 * --------------------------------------------------------------------------
 * Floating status indicator above the character's head. Currently shows
 * the reload progress bar; future additions: low-HP pulse, damage
 * flash, debuff icons, etc. The name is generic so adding new states
 * doesn't require renaming the file.
 *
 * World-anchored (follows the body position) — different from
 * character-hub.ts and weapon-hud.ts which are screen-anchored. The
 * root container is repositioned each frame.
 */

import * as Phaser from 'phaser';

import { BaseHud } from './base-hub';

// 2× the previous dimensions — small indicators were hard to read.
const BAR_W = 72;
const BAR_H = 8;
const OFFSET_Y = -34; // above character center
const COMPLETED_FLASH_MS = 600;
const LABEL_COLOR = '#bbf7d0';

/** Subset of weapon-slot state the indicator needs to render. */
export interface StatusHudState {
    reloading: boolean;
    reloadStartedAt: number;
    reloadTimeMs: number;
    justCompletedAt: number;
}

export class StatusHud extends BaseHud {
    private readonly body: MatterJS.BodyType;
    private readonly bg: Phaser.GameObjects.Graphics;
    private readonly fill: Phaser.GameObjects.Graphics;
    private readonly label: Phaser.GameObjects.Text;

    constructor(scene: Phaser.Scene, body: MatterJS.BodyType) {
        // Coords are placeholders — root.setPosition is called every
        // frame in update() to follow the body.
        super(scene, 0, 0, 1000);
        this.body = body;

        this.bg = scene.add.graphics();
        this.bg.fillStyle(0x052e16, 0.85);
        // Bar is centered horizontally on the body, drawn at cy (set
        // per frame). Use a local-x range so the container's
        // setPosition alone puts it where we want.
        this.bg.fillRect(-BAR_W / 2, 0, BAR_W, BAR_H);
        this.root.add(this.bg);

        this.fill = scene.add.graphics();
        this.root.add(this.fill);

        this.label = scene.add
            .text(0, 0, '', {
                fontFamily: 'monospace',
                fontSize: '10px',
                color: LABEL_COLOR,
            })
            .setOrigin(0.5, 1);
        this.root.add(this.label);
    }

    /**
     * Reposition above body + draw based on current state.
     * Call once per frame from character.ts.
     */
    update(state: StatusHudState, time: number, halfH: number): void {
        const pos = this.body.position;
        this.root.setPosition(pos.x, pos.y - halfH + OFFSET_Y);

        const cx = 0;
        const cy = 0;
        const showReloading = state.reloading;
        const showCompleted = state.justCompletedAt > 0;

        if (showReloading || showCompleted) {
            this.bg.setVisible(true);
            this.bg.clear();
            this.bg.fillStyle(0x052e16, 0.85);
            this.bg.fillRect(cx - BAR_W / 2, cy, BAR_W, BAR_H);
        } else {
            this.bg.setVisible(false);
        }

        this.fill.clear();
        if (showReloading) {
            const elapsed = time - state.reloadStartedAt;
            const frac = Math.max(0, Math.min(1, elapsed / state.reloadTimeMs));
            this.fill.fillStyle(0xbbf7d0, 0.95);
            this.fill.fillRect(cx - BAR_W / 2, cy, BAR_W * frac, BAR_H);
            this.label.setText('Reloading…');
            this.label.setPosition(cx, cy - 2);
        } else if (showCompleted) {
            const since = time - state.justCompletedAt;
            const alpha = 1 - since / COMPLETED_FLASH_MS;
            this.fill.fillStyle(0xbbf7d0, alpha);
            this.fill.fillRect(cx - BAR_W / 2, cy, BAR_W, BAR_H);
            this.label.setText('Full');
            this.label.setPosition(cx, cy - 2);
            this.label.setAlpha(alpha);
        } else {
            this.label.setText('');
        }
    }
}