/**
 * src/game/weapons/hit-sparks.ts
 * --------------------------------------------------------------------------
 * Visceral physical mosaic pixel blood mist & impact debris particle effect.
 * Produces dispersed micro pixel blood mist (2px~3px) and droplet chips (4px~5px)
 * scattering naturally across the impact area.
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
// arterial crimson, scarlet mist, ruby gore, coagulated dark blood, and specular glints
const BLOOD_PALETTE = [
    0xff0033, // vibrant arterial crimson
    0xd90429, // vivid crimson blood
    0xef233c, // fresh scarlet blood mist
    0xb91c1c, // deep blood red
    0x9b111e, // ruby gore
    0x660708, // dark coagulated maroon
    0xffffff, // specular glint
];

const CRIT_BLOOD_PALETTE = [
    0xff0033,
    0xd90429,
    0xef233c,
    0xfbbf24, // gold crit spark
    0xf59e0b, // amber fire
    0xffffff, // brilliant white glint
    0x9b111e,
];

/**
 * Spawn a dispersed burst of physical mosaic pixel blood mist and droplets at (x, y).
 */
export function spawnHitSparks(
    scene: Phaser.Scene,
    x: number,
    y: number,
    opts: HitSparksOptions = {},
): void {
    const isCrit = opts.isCrit ?? false;
    const count = opts.count ?? (isCrit ? 36 : 24);
    const baseAngle =
        opts.dir && (opts.dir.x !== 0 || opts.dir.y !== 0)
            ? Math.atan2(opts.dir.y, opts.dir.x)
            : -Math.PI / 2; // Default burst upwards if no direction
    const baseSpeed = opts.speed ?? 170;

    // Guaranteed top rendering depth above all map materials and entities
    const renderDepth = opts.depth ?? DEPTH.HUD + 5000;

    const palette = isCrit ? CRIT_BLOOD_PALETTE : BLOOD_PALETTE;

    for (let i = 0; i < count; i++) {
        // Disperse spawn origin around monster body for a natural blood mist cloud
        const jitterRadius = Math.random() * 14;
        const jitterAngle = Math.random() * Math.PI * 2;
        const spawnX = x + Math.cos(jitterAngle) * jitterRadius;
        const spawnY = y + Math.sin(jitterAngle) * jitterRadius;

        // Dispersed angles: 65% directional spray cone, 35% radial omnidirectional mist
        const isSpray = Math.random() < 0.65;
        const spread = (Math.random() - 0.5) * 2.2;
        const angle = isSpray
            ? baseAngle + Math.PI + spread
            : Math.random() * Math.PI * 2;

        // Mosaic pixel blood mist sizes: 2px (fine mist), 3px (mist speck), 4px~5px (droplets)
        const size =
            Math.random() < 0.45
                ? 2
                : Math.random() < 0.75
                ? 3
                : Math.random() < 0.92
                ? 4
                : 5;

        const chipColor =
            opts.color ?? palette[Math.floor(Math.random() * palette.length)];

        // Gentle semi-transparent mist opacity: fine specks (2-3px) around 0.65~0.75, droplets around 0.8~0.85
        const initialAlpha =
            size <= 3
                ? 0.68 + Math.random() * 0.1
                : 0.82 + Math.random() * 0.08;

        // Crisp pixel block with subtle outline on droplets to keep retro pixel fidelity
        const chip = scene.add.rectangle(
            spawnX,
            spawnY,
            size,
            size,
            chipColor,
            initialAlpha,
        );
        chip.alpha = initialAlpha;
        chip.setDepth(renderDepth);
        chip.setStrokeStyle(1, 0x1f0000, (size >= 4 ? 0.45 : 0.2) * initialAlpha);

        // Speed variation: suspended floating mist specks vs bursting droplets
        const speedMult =
            Math.random() < 0.35
                ? 0.3 + Math.random() * 0.3
                : 0.65 + Math.random() * 0.75;

        const horizDist =
            (16 + Math.random() * (baseSpeed * 0.35)) *
            speedMult *
            Math.cos(angle);
        const vertPop =
            Math.sin(angle) *
                (12 + Math.random() * (isCrit ? 35 : 25)) *
                speedMult -
            Math.random() * 8;
        const gravityDrop =
            (14 + Math.random() * (isCrit ? 30 : 20)) *
            (size >= 4 ? 1.1 : 0.6);

        const midX = spawnX + horizDist * 0.45;
        const midY = spawnY + vertPop;
        const targetX = spawnX + horizDist;
        const targetY = spawnY + vertPop + gravityDrop;

        const duration = 400 + Math.random() * 250; // 400ms ~ 650ms
        const popTime = duration * 0.35;
        const fallTime = duration * 0.65;

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
