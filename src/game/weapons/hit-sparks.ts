/**
 * src/game/weapons/hit-sparks.ts
 * --------------------------------------------------------------------------
 * Lightweight micro pixel spark & mosaic debris particle effect for impacts.
 * Spawns 4-6 tiny square mosaic pixel chips (2x2, 3x3, 4x4) that burst outward
 * and fall under simulated gravity like physical debris chipping off.
 */

import type * as Phaser from 'phaser';

import { DEPTH } from '@/lib/constants';

export interface HitSparksOptions {
    count?: number;
    color?: number;
    dir?: { x: number; y: number };
    speed?: number;
    isCrit?: boolean;
}

const DEBRIS_PALETTE = [0xffffff, 0xfbbf24, 0xf59e0b, 0xf97316, 0xe2e8f0, 0x94a3b8];

/**
 * Spawn a burst of mosaic pixel chips and sparks at (x, y).
 */
export function spawnHitSparks(
    scene: Phaser.Scene,
    x: number,
    y: number,
    opts: HitSparksOptions = {},
): void {
    const count = opts.count ?? (opts.isCrit ? 7 : 5);
    const baseAngle = opts.dir ? Math.atan2(opts.dir.y, opts.dir.x) : 0;
    const baseSpeed = opts.speed ?? 60;

    for (let i = 0; i < count; i++) {
        // Spread backwards and outwards from velocity direction
        const spread = (Math.random() - 0.5) * 2.2;
        const angle = baseAngle + Math.PI + spread;
        const horizDist = (8 + Math.random() * (baseSpeed * 0.25)) * (Math.random() < 0.5 ? 1 : -1);
        const vertPop = -(6 + Math.random() * 14); // initial upward pop
        const gravityDrop = 14 + Math.random() * 20; // downward fall

        // Mosaic square chip dimensions (2x2, 3x3, 4x4)
        const size = Math.random() < 0.4 ? 2 : Math.random() < 0.8 ? 3 : 4;
        const chipColor =
            opts.color ?? DEBRIS_PALETTE[Math.floor(Math.random() * DEBRIS_PALETTE.length)];

        const chip = scene.add.rectangle(x, y, size, size, chipColor);
        chip.setDepth(DEPTH.BULLET + 50);

        const targetX = x + Math.cos(angle) * Math.abs(horizDist);
        const targetY = y + vertPop + gravityDrop;

        scene.tweens.add({
            targets: chip,
            x: targetX,
            y: targetY,
            alpha: { from: 1, to: 0 },
            duration: 180 + Math.random() * 70,
            ease: 'Quad.easeOut',
            onComplete: () => {
                chip.destroy();
            },
        });
    }
}
