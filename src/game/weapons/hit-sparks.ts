/**
 * src/game/weapons/hit-sparks.ts
 * --------------------------------------------------------------------------
 * Visceral physical mosaic pixel blood & impact debris particle effect.
 * Spawns chunky, high-contrast square mosaic blood cubes (4x4 ~ 7x7 px) with
 * dark coagulated pixel outlines, explosive directional pop, and a parabolic
 * gravity drop arc that splatters down before dissolving.
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

// Vivid pixel blood & flesh mosaic palette:
// arterial crimson, vivid scarlet, deep coagulated maroon, ruby blood, flesh tone, with occasional specular gleam
const BLOOD_PALETTE = [
    0xdc2626, // red-600 — arterial blood
    0xb91c1c, // red-700 — deep crimson blood
    0xef4444, // red-500 — bright fresh blood splatter
    0x991b1b, // red-800 — dark blood
    0x7f1d1d, // red-900 — coagulated maroon
    0xf87171, // red-400 — fresh flesh droplet
    0xdc2626, // repeated for higher arterial frequency
    0xffffff, // specular highlight glint
];

// On crits: add explosive fiery sparks alongside abundant blood
const CRIT_BLOOD_PALETTE = [
    0xef4444,
    0xdc2626,
    0xb91c1c,
    0xfbbf24, // gold crit spark
    0xf59e0b, // amber flame
    0xffffff, // brilliant white
    0x991b1b,
    0xf87171,
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
    const baseSpeed = opts.speed ?? 140;

    // Render depth: guaranteed foreground layer above monster sprites, weapons, and foreground tiles
    const renderDepth = opts.depth ?? DEPTH.MELEE_SLASH + 100;

    const palette = isCrit ? CRIT_BLOOD_PALETTE : BLOOD_PALETTE;

    for (let i = 0; i < count; i++) {
        // Wide explosive splatter cone (~140 degrees arc)
        const spread = (Math.random() - 0.5) * 2.5;
        const angle = baseAngle + Math.PI + spread;

        // Upward pop and parabolic gravity drop distances
        const speedMult = 0.4 + Math.random() * 0.7;
        const horizDist = (18 + Math.random() * (baseSpeed * 0.35 * speedMult)) * Math.cos(angle);
        const vertPop = -(16 + Math.random() * (isCrit ? 36 : 24)); // Explosive pop up
        const gravityDrop = 32 + Math.random() * (isCrit ? 48 : 36); // Heavy fall down to ground

        // Chunky mosaic pixel cube size: 4px, 5px, 6px (7px on crits)
        const size = isCrit
            ? Math.random() < 0.35 ? 5 : Math.random() < 0.7 ? 6 : 7
            : Math.random() < 0.4 ? 4 : Math.random() < 0.75 ? 5 : 6;

        const chipColor =
            opts.color ?? palette[Math.floor(Math.random() * palette.length)];

        // Create chunky mosaic rectangle with dark coagulated pixel stroke for high readability
        const chip = scene.add.rectangle(x, y, size, size, chipColor);
        chip.setDepth(renderDepth);
        chip.setStrokeStyle(1, 0x450a0a, 0.95); // 1px dark coagulated maroon/black outline

        const midY = y + vertPop;
        const targetX = x + horizDist;
        const targetY = y + vertPop + gravityDrop;

        // Two-phase parabolic pop & gravity fall tween (420ms ~ 600ms total duration)
        const duration = 420 + Math.random() * 180;

        scene.tweens.add({
            targets: chip,
            x: { from: x, to: targetX },
            y: [
                { value: midY, duration: duration * 0.35, ease: 'Quad.easeOut' },
                { value: targetY, duration: duration * 0.65, ease: 'Quad.easeIn' },
            ],
            alpha: { from: 1, to: 0, delay: duration * 0.55, duration: duration * 0.45 },
            scale: { from: 1, to: 0.7, delay: duration * 0.6, duration: duration * 0.4 },
            onComplete: () => {
                chip.destroy();
            },
        });
    }
}
