import { Scene } from 'phaser';

import { EventBus } from '@/lib/events/bus';
import type { AirWall, Level } from '@/lib/levels/types';

/**
 * Generic scene loader. The Level is fetched by the caller (main.ts)
 * and passed in via the constructor — Phaser's `init()` does NOT await
 * async work, so doing the fetch here would race with `preload()`.
 *
 * One scene class covers every level — there is no per-level file.
 *
 * Air wall colors:
 *   tall   — solid: blocks character AND bullets → red
 *   short  — half:  blocks character only, bullets pass over → blue
 */
export class LoadScene extends Scene {
    constructor(
        id: string,
        private readonly level: Level,
    ) {
        super(`LoadScene:${id}`);
    }

    preload(): void {
        this.load.image('background', this.level.background);
    }

    create(): void {
        const { width, height } = this.scale;

        const bg = this.add.image(width / 2, height / 2, 'background');
        bg.setDisplaySize(width, height);

        for (const wall of this.level.airWalls) {
            this.renderWall(wall);
        }

        EventBus.emit('current-scene-ready', this);
    }

    private renderWall(wall: AirWall): void {
        const color = wall.kind === 'tall' ? 0xff3344 : 0x3388ff;
        const rect = this.add.rectangle(
            wall.x + wall.width / 2,
            wall.y + wall.height / 2,
            wall.width,
            wall.height,
            color,
            0.35,
        );
        rect.setStrokeStyle(2, color, 0.9).setName(wall.id);
    }
}