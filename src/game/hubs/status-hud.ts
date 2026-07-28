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

import {
    HUD_COMPLETED_FLASH_MS,
    HUD_FILL_ALPHA,
    HUD_FONT_LABEL,
    HUD_STATUS_BAR_BG,
    HUD_STATUS_BAR_FILL,
    HUD_STATUS_BAR_H,
    HUD_STATUS_BAR_W,
    HUD_STATUS_LABEL_COLOR,
    HUD_STATUS_LABEL_OFFSET_Y,
    HUD_STATUS_OFFSET_Y,
    HUD_BG_ALPHA,
} from '@/lib/constants';

import { BaseHud } from './base-hub';

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
        this.bg.fillStyle(HUD_STATUS_BAR_BG, HUD_BG_ALPHA);
        // Bar is centered horizontally on the body, drawn at cy (set
        // per frame). Use a local-x range so the container's
        // setPosition alone puts it where we want.
        this.bg.fillRect(-HUD_STATUS_BAR_W / 2, 0, HUD_STATUS_BAR_W, HUD_STATUS_BAR_H);
        this.root.add(this.bg);

        this.fill = scene.add.graphics();
        this.root.add(this.fill);

        this.label = scene.add
            .text(0, 0, '', {
                fontFamily: 'monospace',
                fontSize: HUD_FONT_LABEL,
                color: HUD_STATUS_LABEL_COLOR,
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
        this.root.setPosition(pos.x, pos.y - halfH + HUD_STATUS_OFFSET_Y);

        const cx = 0;
        const cy = 0;
        const showReloading = state.reloading;
        const showCompleted = state.justCompletedAt > 0;

        if (showReloading || showCompleted) {
            this.bg.setVisible(true);
            this.bg.clear();
            this.bg.fillStyle(HUD_STATUS_BAR_BG, HUD_BG_ALPHA);
            this.bg.fillRect(cx - HUD_STATUS_BAR_W / 2, cy, HUD_STATUS_BAR_W, HUD_STATUS_BAR_H);
        } else {
            this.bg.setVisible(false);
        }

        this.fill.clear();
        if (showReloading) {
            const elapsed = time - state.reloadStartedAt;
            const frac = Math.max(0, Math.min(1, elapsed / state.reloadTimeMs));
            this.fill.fillStyle(HUD_STATUS_BAR_FILL, HUD_FILL_ALPHA);
            this.fill.fillRect(
                cx - HUD_STATUS_BAR_W / 2,
                cy,
                HUD_STATUS_BAR_W * frac,
                HUD_STATUS_BAR_H,
            );
            this.label.setText('Reloading…');
            this.label.setPosition(cx, cy + HUD_STATUS_LABEL_OFFSET_Y);
        } else if (showCompleted) {
            const since = time - state.justCompletedAt;
            const alpha = 1 - since / HUD_COMPLETED_FLASH_MS;
            this.fill.fillStyle(HUD_STATUS_BAR_FILL, alpha);
            this.fill.fillRect(cx - HUD_STATUS_BAR_W / 2, cy, HUD_STATUS_BAR_W, HUD_STATUS_BAR_H);
            this.label.setText('Full');
            this.label.setPosition(cx, cy + HUD_STATUS_LABEL_OFFSET_Y);
            this.label.setAlpha(alpha);
        } else {
            this.label.setText('');
        }
    }
}