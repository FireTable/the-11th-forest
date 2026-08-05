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
    HUD_FONT_LABEL,
    HUD_STATUS_BAR_BG,
    HUD_STATUS_BAR_W,
    HUD_STATUS_LABEL_COLOR,
    HUD_BG_ALPHA,
} from '@/lib/constants';

import { BaseHud } from './base-hub';

/**
 * Half-width / half-height of the random offset applied to each new
 * floating combat number so simultaneous hits spread instead of stacking.
 * Tuned small enough to stay near the status bar, large enough that
 * 5+ hits/sec don't visually overlap into one unreadable blob.
 */
const FLOATING_JITTER_X = 8;
const FLOATING_JITTER_Y = 4;

/**
 * Pick the per-spawn position offset for a floating combat number. Pure
 * helper so tests can inject a deterministic RNG; defaults to Math.random.
 *
 * Two jitter draws: first for horizontal (x), second for vertical (y).
 */
export function computeFloatingNumberSpawn(
    baseX: number,
    baseY: number,
    jitterFn: () => number = Math.random,
): { x: number; y: number } {
    return {
        x: baseX + (jitterFn() - 0.5) * 2 * FLOATING_JITTER_X,
        y: baseY + (jitterFn() - 0.5) * 2 * FLOATING_JITTER_Y,
    };
}

export interface StatusHudState {
    name?: string;
    reloading?: boolean;
    reloadStartedAt?: number;
    reloadTimeMs?: number;
    justCompletedAt?: number;
    hp?: number;
    maxHp?: number;
    showHpBar?: boolean;
    sp?: number;
    maxSp?: number;
    showSpBar?: boolean;
    dodgeActive?: boolean;
    dodgeCooldownStartedAt?: number;
    dodgeCooldownTimeMs?: number;
    barWidth?: number;
}

interface FloatingText {
    textObj: Phaser.GameObjects.Text;
    startX: number;
    startY: number;
    createdAt: number;
    durationMs: number;
}

export class StatusHud extends BaseHud {
    private readonly body: MatterJS.BodyType;
    private readonly bg: Phaser.GameObjects.Graphics;
    private readonly fill: Phaser.GameObjects.Graphics;
    private readonly hpFill: Phaser.GameObjects.Graphics;
    private readonly spFill: Phaser.GameObjects.Graphics;
    private readonly reloadCircle: Phaser.GameObjects.Graphics;
    private readonly label: Phaser.GameObjects.Text;
    private readonly nameLabel: Phaser.GameObjects.Text;
    private floatingTexts: FloatingText[] = [];

    constructor(scene: Phaser.Scene, body: MatterJS.BodyType) {
        super(scene, 0, 0, 9999);
        this.body = body;

        this.bg = scene.add.graphics();
        this.bg.fillStyle(HUD_STATUS_BAR_BG, HUD_BG_ALPHA);
        this.bg.fillRect(-HUD_STATUS_BAR_W / 2, 0, HUD_STATUS_BAR_W, 4);
        this.root.add(this.bg);

        this.hpFill = scene.add.graphics();
        this.root.add(this.hpFill);

        // Micro SP bar below HP bar
        this.spFill = scene.add.graphics();
        this.root.add(this.spFill);

        // Circular Reload Ring on the Left side
        this.reloadCircle = scene.add.graphics();
        this.root.add(this.reloadCircle);

        this.fill = scene.add.graphics();
        this.root.add(this.fill);

        // Name text above status bar
        this.nameLabel = scene.add
            .text(0, -2, '', {
                fontFamily: 'monospace',
                fontSize: '11px',
                color: '#ffffff',
                stroke: '#000000',
                strokeThickness: 2,
                shadow: {
                    offsetX: 1,
                    offsetY: 1,
                    color: '#000000',
                    blur: 0,
                    stroke: true,
                    fill: true,
                },
            })
            .setResolution(2)
            .setOrigin(0.5, 1);
        this.root.add(this.nameLabel);

        this.label = scene.add
            .text(0, 0, '', {
                fontFamily: 'monospace',
                fontSize: HUD_FONT_LABEL,
                color: HUD_STATUS_LABEL_COLOR,
                stroke: '#000000',
                strokeThickness: 2,
            })
            .setResolution(2)
            .setOrigin(0.5, 1);
        this.root.add(this.label);
    }

    /**
     * Display damage/heal numbers floating upwards on the RIGHT side.
     */
    showFloatingNumber(amount: number, type: 'damage' | 'heal' | 'crit'): void {
        const isHeal = type === 'heal';
        const isCrit = type === 'crit';
        const absVal = Math.abs(amount);
        const textStr = isHeal ? `+${absVal}` : isCrit ? `-${absVal}` : `-${absVal}`;
        const colorStr = isHeal ? '#34d399' : isCrit ? '#fbbf24' : '#f87171'; // Green / Gold / Red

        // Floating offset to the right side of status bar, jittered per hit
        // so high-frequency damage doesn't pile into a single unreadable blob.
        const baseX = HUD_STATUS_BAR_W / 2 + 8;
        const { x: startX, y: startY } = computeFloatingNumberSpawn(baseX, 0);
        const textObj = this.scene.add
            .text(startX, startY, textStr, {
                fontFamily: 'monospace',
                fontSize: isHeal ? '12px' : isCrit ? '18px' : '14px',
                color: colorStr,
                fontStyle: 'bold',
                stroke: '#000000',
                strokeThickness: isCrit ? 3 : 2,
                shadow: {
                    offsetX: 1,
                    offsetY: 1,
                    color: '#000000',
                    blur: 0,
                    stroke: true,
                    fill: true,
                },
            })
            .setResolution(2)
            .setOrigin(0, 0.5);

        this.root.add(textObj);

        this.floatingTexts.push({
            textObj,
            startX,
            startY,
            createdAt: this.scene.time.now,
            durationMs: isCrit ? 1100 : 800,
        });
    }


    /**
     * Reposition above body (hitbox top) + draw.
     * `halfH` is the height offset from body center to top of hitbox.
     */
    update(state: StatusHudState, time: number, topOffset: number): void {
        const pos = this.body.position;
        const BAR_W = state.barWidth ?? HUD_STATUS_BAR_W;
        const BAR_H = 4;
        const SP_BAR_H = 2;
        const RADIUS = 2;

        const showSp = !!state.showSpBar && state.sp !== undefined && state.maxSp !== undefined;
        const totalHeight = showSp ? BAR_H + SP_BAR_H + 2 : BAR_H;

        // Position status HUD container so the bar sits completely ABOVE the top edge with a 12px gap.
        const topY = pos.y - topOffset - totalHeight - 12;
        this.root.setPosition(pos.x, topY);

        const cx = 0;
        const cy = 0;
        const showReloading = !!state.reloading;
        const showHp = !!state.showHpBar && state.hp !== undefined && state.maxHp !== undefined;

        // 1. Draw Background Outer Box (Pixel Rounded Rect & Dark Border)
        this.bg.clear();
        if (showHp) {
            // Dark border & shadow
            this.bg.fillStyle(0x0f172a, 0.95);
            this.bg.fillRoundedRect(
                cx - BAR_W / 2 - 1,
                cy - 1,
                BAR_W + 2,
                totalHeight + 2,
                RADIUS + 1,
            );
            this.bg.lineStyle(1, 0x334155, 1);
            this.bg.strokeRoundedRect(
                cx - BAR_W / 2 - 1,
                cy - 1,
                BAR_W + 2,
                totalHeight + 2,
                RADIUS + 1,
            );
        }

        // 2. Draw Name Label (Positioned cleanly 2px above the HP bar top)
        if (state.name) {
            this.nameLabel.setText(state.name);
            this.nameLabel.setPosition(cx, cy - 2);
            this.nameLabel.setVisible(true);
        } else {
            this.nameLabel.setVisible(false);
        }

        // 3. Draw HP Fill
        this.hpFill.clear();
        if (showHp && state.hp !== undefined && state.maxHp !== undefined && state.maxHp > 0) {
            const hpFrac = Math.max(0, Math.min(1, state.hp / state.maxHp));
            this.hpFill.fillStyle(0xef4444, 1.0); // Bright Red HP Fill
            if (hpFrac > 0) {
                const fillW = Math.max(2, BAR_W * hpFrac);
                this.hpFill.fillRoundedRect(cx - BAR_W / 2, cy, fillW, BAR_H, RADIUS);
            }
        }

        // 4. Draw Micro SP Fill (If SP < maxSp)
        this.spFill.clear();
        if (showSp && state.sp !== undefined && state.maxSp !== undefined && state.maxSp > 0) {
            const spFrac = Math.max(0, Math.min(1, state.sp / state.maxSp));
            const spY = cy + BAR_H + 1;
            this.spFill.fillStyle(0x0284c7, 1.0); // Cyan SP Fill
            if (spFrac > 0) {
                const spW = Math.max(1, BAR_W * spFrac);
                this.spFill.fillRect(cx - BAR_W / 2, spY, spW, SP_BAR_H);
            }
        }

        // 5. Draw Left Circular Progress Rings (Supports simultaneous Dodge Roll & Reloading)
        this.reloadCircle.clear();

        const isDodgeCooldown =
            !!state.dodgeCooldownStartedAt &&
            !!state.dodgeCooldownTimeMs &&
            time < state.dodgeCooldownStartedAt + state.dodgeCooldownTimeMs;
        const hasDodgeRing = !!(state.dodgeActive || isDodgeCooldown);
        const hasReloadRing = !!(showReloading && state.reloadStartedAt && state.reloadTimeMs);

        // Position offset: Dodge Ring is closer to status bar (ringX = -10), Reload Ring is further left (ringX = -26 if dodge active, else -10)
        const dodgeRingX = cx - BAR_W / 2 - 10;
        const reloadRingX = hasDodgeRing ? cx - BAR_W / 2 - 26 : cx - BAR_W / 2 - 10;
        const ringY = cy + BAR_H / 2;

        // A. Dodge Progress Ring (Sky Blue - Positioned closer/靠右)
        if (hasDodgeRing) {
            const elapsed = time - (state.dodgeCooldownStartedAt ?? time);
            const frac = Math.max(0, Math.min(1, elapsed / (state.dodgeCooldownTimeMs ?? 1)));

            // Background circle
            this.reloadCircle.fillStyle(0x0f172a, 0.9);
            this.reloadCircle.fillCircle(dodgeRingX, ringY, 7);
            this.reloadCircle.lineStyle(1.5, 0x0369a1, 1);
            this.reloadCircle.strokeCircle(dodgeRingX, ringY, 7);

            // Progress Arc
            this.reloadCircle.lineStyle(2, 0x38bdf8, 1); // Sky blue dodge ring
            const startAngle = Phaser.Math.DegToRad(-90);
            const endAngle = Phaser.Math.DegToRad(-90 + 360 * frac);
            this.reloadCircle.beginPath();
            this.reloadCircle.arc(dodgeRingX, ringY, 5, startAngle, endAngle, false);
            this.reloadCircle.strokePath();
        }

        // B. Weapon Reloading Ring (Amber - Positioned on far left/靠左 if dodge is present)
        if (hasReloadRing) {
            const elapsed = time - state.reloadStartedAt!;
            const frac = Math.max(0, Math.min(1, elapsed / state.reloadTimeMs!));

            // Background circle
            this.reloadCircle.fillStyle(0x0f172a, 0.9);
            this.reloadCircle.fillCircle(reloadRingX, ringY, 7);
            this.reloadCircle.lineStyle(1.5, 0x475569, 1);
            this.reloadCircle.strokeCircle(reloadRingX, ringY, 7);

            // Progress Arc
            this.reloadCircle.lineStyle(2, 0xf59e0b, 1); // Amber ring
            const startAngle = Phaser.Math.DegToRad(-90);
            const endAngle = Phaser.Math.DegToRad(-90 + 360 * frac);
            this.reloadCircle.beginPath();
            this.reloadCircle.arc(reloadRingX, ringY, 5, startAngle, endAngle, false);
            this.reloadCircle.strokePath();
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
                item.textObj.setX(item.startX);
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
