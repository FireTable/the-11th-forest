/**
 * src/game/weapons/hit-sparks.ts
 * --------------------------------------------------------------------------
 * Chunky mosaic pixel debris particle effect for impacts.
 * Spawns bold, chunky square mosaic pixel chips (4x4, 5x5, 6x6 px) with
 * high-contrast borders and an explosive parabolic pop & downward gravity fall.
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

// Chunky vivid debris palette: bright white, amber, gold, flame orange, slate gray
const DEBRIS_PALETTE = [0xffffff, 0xfde047, 0xf59e0b, 0xf97316, 0xffffff, 0x94a3b8];

/**
 * Spawn a burst of chunky mosaic pixel chips and sparks at (x, y).
 */
export function spawnHitSparks(
    scene: Phaser.Scene,
    x: number,
    y: number,
    opts: HitSparksOptions = {},
): void {
    const isCrit = opts.isCrit ?? false;
    const count = opts.count ?? (isCrit ? 10 : 7);
    const baseAngle = opts.dir && (opts.dir.x !== 0 || opts.dir.y !== 0)
        ? Math.atan2(opts.dir.y, opts.dir.x)
        : -Math.PI / 2; // Default burst upwards if no direction
    const baseSpeed = opts.speed ?? 120;

    // Render depth: must sit comfortably above monster body/weapons (footY ~300..1000)
    // so the debris clearly pops in the foreground without being hidden behind sprites.
    const renderDepth = opts.depth ?? Math.max(y + 100, DEPTH.WEAPON + 200);

    for (let i = 0; i < count; i++) {
        // Broad cone spread (around 120 degrees arc)
        const spread = (Math.random() - 0.5) * 2.4;
        const angle = baseAngle + Math.PI + spread;

        // Upward pop and parabolic gravity drop distances
        const horizDist = (14 + Math.random() * (baseSpeed * 0.28)) * Math.cos(angle);
        const vertPop = -(12 + Math.random() * (isCrit ? 28 : 20)); // Stronger initial pop up
        const gravityDrop = 25 + Math.random() * (isCrit ? 35 : 25); // Heavy fall down

        // Chunky mosaic pixel cube size: 4px, 5px, 6px (7px on crits)
        const size = isCrit
            ? Math.random() < 0.4 ? 5 : Math.random() < 0.7 ? 6 : 7
            : Math.random() < 0.4 ? 4 : Math.random() < 0.8 ? 5 : 6;

        const chipColor =
            opts.color ??
            DEBRIS_PALETTE[Math.floor(Math.random() * DEBRIS_PALETTE.length)];

        // Create chunky mosaic rectangle with high-contrast pixel stroke
        const chip = scene.add.rectangle(x, y, size, size, chipColor);
        chip.setDepth(renderDepth);
        chip.setStrokeStyle(1, 0x0f172a, 0.9); // 1px dark slate outline for crisp pixel readability

        const midY = y + vertPop;
        const targetX = x + horizDist;
        const targetY = y + vertPop + gravityDrop;

        // Two-phase parabolic pop & gravity fall tween
        const duration = 280 + Math.random() * 120; // 280ms ~ 400ms

        scene.tweens.add({
            targets: chip,
            x: { from: x, to: targetX },
            y: [
                { value: midY, duration: duration * 0.35, ease: 'Quad.easeOut' },
                { value: targetY, duration: duration * 0.65, ease: 'Quad.easeIn' },
            ],
            alpha: { from: 1, to: 0, delay: duration * 0.4, duration: duration * 0.6 },
            scale: { from: 1, to: 0.6, delay: duration * 0.5, duration: duration * 0.5 },
            onComplete: () => {
                chip.destroy();
            },
        });
    }
}
