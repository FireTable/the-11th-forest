/**
 * src/game/hubs/status-hud.ts
 * --------------------------------------------------------------------------
 * Floating status indicator & floating combat numbers (Damage / Heal)
 * above entity hitboxes (Character & Monsters).
 *
 * World-anchored (follows body position).
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
    HUD_BG_ALPHA,
} from '@/lib/constants';

import { BaseHud } from './base-hub';

export interface StatusHudState {
    name?: string;
    reloading?: boolean;
    reloadStartedAt?: number;
    reloadTimeMs?: number;
    justCompletedAt?: number;
    hp?: number;
    maxHp?: number;
    showHpBar?: boolean;
}

interface FloatingText {
    textObj: Phaser.GameObjects.Text;
    startY: number;
    createdAt: number;
    durationMs: number;
}

export class StatusHud extends BaseHud {
    private readonly body: MatterJS.BodyType;
    private readonly bg: Phaser.GameObjects.Graphics;
    private readonly fill: Phaser.GameObjects.Graphics;
    private readonly hpFill: Phaser.GameObjects.Graphics;
    private readonly label: Phaser.GameObjects.Text;
    private readonly nameLabel: Phaser.GameObjects.Text;
    private floatingTexts: FloatingText[] = [];

    constructor(scene: Phaser.Scene, body: MatterJS.BodyType) {
        super(scene, 0, 0, 1000);
        this.body = body;

        this.bg = scene.add.graphics();
        this.bg.fillStyle(HUD_STATUS_BAR_BG, HUD_BG_ALPHA);
        this.bg.fillRect(-HUD_STATUS_BAR_W / 2, 0, HUD_STATUS_BAR_W, HUD_STATUS_BAR_H);
        this.root.add(this.bg);

        this.hpFill = scene.add.graphics();
        this.root.add(this.hpFill);

        this.fill = scene.add.graphics();
        this.root.add(this.fill);

        // Name text above status bar
        this.nameLabel = scene.add
            .text(0, -2, '', {
                fontFamily: 'monospace',
                fontSize: '10px',
                color: '#e2e8f0',
                stroke: '#0f172a',
                strokeThickness: 2,
            })
            .setOrigin(0.5, 1);
        this.root.add(this.nameLabel);

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
     * Display damage/heal numbers floating upwards on the RIGHT side.
     */
    showFloatingNumber(amount: number, type: 'damage' | 'heal'): void {
        const isHeal = type === 'heal';
        const absVal = Math.abs(amount);
        const textStr = isHeal ? `+${absVal}` : `-${absVal}`;
        const colorStr = isHeal ? '#34d399' : '#f87171'; // Green for heal, Red for damage

        // Floating offset to the right side of status bar
        const rightX = HUD_STATUS_BAR_W / 2 + 8;
        const textObj = this.scene.add
            .text(rightX, 0, textStr, {
                fontFamily: 'monospace',
                fontSize: isHeal ? '12px' : '14px',
                color: colorStr,
                fontStyle: 'bold',
                stroke: '#0f172a',
                strokeThickness: 3,
            })
            .setOrigin(0, 0.5);

        this.root.add(textObj);

        this.floatingTexts.push({
            textObj,
            startY: 0,
            createdAt: this.scene.time.now,
            durationMs: 800,
        });
    }

    /**
     * Reposition above body (hitbox top) + draw.
     * `halfH` is the height offset from body center to top of hitbox.
     */
    update(state: StatusHudState, time: number, topOffset: number): void {
        const pos = this.body.position;
        // Position status HUD container so the bar sits completely ABOVE the top edge with a 12px gap.
        const topY = pos.y - topOffset - HUD_STATUS_BAR_H - 12;
        this.root.setPosition(pos.x, topY);

        const cx = 0;
        const cy = 0;
        const showReloading = !!state.reloading;
        const showCompleted = (state.justCompletedAt ?? 0) > 0;
        const showHp = !!state.showHpBar && state.hp !== undefined && state.maxHp !== undefined;

        if (showReloading || showCompleted || showHp) {
            this.bg.setVisible(true);
            this.bg.clear();
            this.bg.fillStyle(HUD_STATUS_BAR_BG, HUD_BG_ALPHA);
            this.bg.fillRect(cx - HUD_STATUS_BAR_W / 2, cy, HUD_STATUS_BAR_W, HUD_STATUS_BAR_H);
        } else {
            this.bg.setVisible(false);
        }

        this.hpFill.clear();
        if (state.name) {
            this.nameLabel.setText(state.name);
            this.nameLabel.setVisible(true);
        } else {
            this.nameLabel.setVisible(false);
        }
        if (showHp && state.hp !== undefined && state.maxHp !== undefined && state.maxHp > 0) {
            const hpFrac = Math.max(0, Math.min(1, state.hp / state.maxHp));
            this.hpFill.fillStyle(0xef4444, 0.9); // Red HP bar for monster/entity
            this.hpFill.fillRect(
                cx - HUD_STATUS_BAR_W / 2,
                cy,
                HUD_STATUS_BAR_W * hpFrac,
                HUD_STATUS_BAR_H,
            );
        }

        // Draw Reload Bar / Text
        this.fill.clear();
        if (showReloading && state.reloadStartedAt && state.reloadTimeMs) {
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
        } else if (showCompleted && state.justCompletedAt) {
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

        // Update floating combat numbers
        for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
            const item = this.floatingTexts[i];
            const elapsed = time - item.createdAt;
            if (elapsed >= item.durationMs) {
                item.textObj.destroy();
                this.floatingTexts.splice(i, 1);
            } else {
                const progress = elapsed / item.durationMs;
                item.textObj.setY(item.startY - progress * 24);
                item.textObj.setAlpha(1 - progress);
            }
        }
    }

    override destroy(): void {
        for (const item of this.floatingTexts) {
            item.textObj.destroy();
        }
        this.floatingTexts = [];
        super.destroy();
    }
}