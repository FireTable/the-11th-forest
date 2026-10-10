/**
 * src/game/weapons/hit-sparks.ts
 * --------------------------------------------------------------------------
 * Visceral physical mosaic pixel blood & impact debris particle effect.
 * Temporarily magnified 10x (28px ~ 48px massive square blocks with 3px outlines)
 * per user request for visual verification of physics, blood palette, and trajectory.
 */

import type * as Phaser from 'phaser';

import { DEPTH } from '@/lib/constants';

export interface HitSparksOptions {
    count?: number;
    color?: number;
    dir?: { x: number; y: number };
    speed?: number;
    isCrit?: boolean;
    depth?: number;
}

// Vivid high-contrast pixel blood mosaic palette:
// blazing arterial red, deep crimson, ruby gore, coagulated dark blood, and specular white gleam
const BLOOD_PALETTE = [
    0xff0000, // vibrant pure blood red
    0xdc2626, // red-600 — arterial crimson
    0xef4444, // red-500 — fresh splatter
    0xb91c1c, // red-700 — deep blood
    0x990000, // dark coagulated maroon
    0xff3366, // vivid ruby flesh
    0xffffff, // specular impact glint
];

const CRIT_BLOOD_PALETTE = [
    0xff0000,
    0xdc2626,
    0xef4444,
    0xfbbf24, // gold crit spark
    0xf59e0b, // amber fire
    0xffffff, // brilliant white flash
    0x990000,
];

/**
 * Spawn a burst of physical mosaic pixel blood chips and debris at (x, y).
 */
export function spawnHitSparks(
    scene: Phaser.Scene,
    x: number,
    y: number,
    opts: HitSparksOptions = {},
): void {
    const isCrit = opts.isCrit ?? false;
    const count = opts.count ?? (isCrit ? 16 : 10);
    const baseAngle =
        opts.dir && (opts.dir.x !== 0 || opts.dir.y !== 0)
            ? Math.atan2(opts.dir.y, opts.dir.x)
            : -Math.PI / 2; // Default burst upwards if no direction
    const baseSpeed = opts.speed ?? 180;

    // Guaranteed top rendering depth above all map materials and entities
    const renderDepth = opts.depth ?? DEPTH.HUD + 5000;

    const palette = isCrit ? CRIT_BLOOD_PALETTE : BLOOD_PALETTE;

    for (let i = 0; i < count; i++) {
        // Wide explosive splatter cone (~140 degrees arc)
        const spread = (Math.random() - 0.5) * 2.5;
        const angle = baseAngle + Math.PI + spread;

        // Magnified 10x: 28px ~ 48px chunky square mosaic cubes
        const size = isCrit
            ? Math.random() < 0.4 ? 36 : Math.random() < 0.7 ? 42 : 48
            : Math.random() < 0.4 ? 28 : Math.random() < 0.75 ? 34 : 40;

        const chipColor =
            opts.color ?? palette[Math.floor(Math.random() * palette.length)];

        // Bold mosaic block with 3px dark stroke for unmistakable visibility
        const chip = scene.add.rectangle(x, y, size, size, chipColor);
        chip.setDepth(renderDepth);
        chip.setStrokeStyle(3, 0x000000, 1.0);

        // Trajectory distances
        const horizDist = (35 + Math.random() * (baseSpeed * 0.45)) * Math.cos(angle);
        const vertPop = -(30 + Math.random() * (isCrit ? 60 : 45)); // High explosive pop up
        const gravityDrop = 60 + Math.random() * (isCrit ? 90 : 70); // Heavy downward drop to floor

        const midX = x + horizDist * 0.45;
        const midY = y + vertPop;
        const targetX = x + horizDist;
        const targetY = y + vertPop + gravityDrop;

        const duration = 550 + Math.random() * 250; // 550ms ~ 800ms
        const popTime = duration * 0.38;
        const fallTime = duration * 0.62;

        // Two-stage sequential tweens: Stage 1 Pop Upward -> Stage 2 Splatter Downward & Fade
        scene.tweens.add({
            targets: chip,
            x: midX,
            y: midY,
            duration: popTime,
            ease: 'Quad.easeOut',
            onComplete: () => {
                scene.tweens.add({
                    targets: chip,
                    x: targetX,
                    y: targetY,
                    alpha: 0,
                    scaleX: 0.6,
                    scaleY: 0.6,
                    duration: fallTime,
                    ease: 'Quad.easeIn',
                    onComplete: () => {
                        chip.destroy();
                    },
                });
            },
        });
    }
}
