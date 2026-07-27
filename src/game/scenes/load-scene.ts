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
        private readonly id: string,
        private readonly level: Level,
    ) {
        super(`LoadScene:${id}`);
    }

    preload(): void {
        this.load.image('background', this.level.background);
    }

    create(): void {
        // World size === image size, so the background displays at native
        // dimensions and air-wall coords align 1:1 with image pixel space.
        this.add.image(0, 0, 'background').setOrigin(0, 0);

        for (const wall of this.level.airWalls) {
            this.renderWall(wall);
        }

        // Center camera on world so the viewport shows the middle of the
        // level when the browser window is smaller than the image.
        this.cameras.main.centerOn(
            this.level.imageSize.width / 2,
            this.level.imageSize.height / 2,
        );

        // Tell the editor panel which scene this is — it listens for
        // `level-loaded` to seed its local state with the same Level the
        // scene is rendering.
        EventBus.emit('level-loaded', { id: this.id, level: this.level });
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