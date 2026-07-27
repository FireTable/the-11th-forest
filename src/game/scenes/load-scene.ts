import { Scene } from 'phaser';

import { loadCharacter } from '@/game/characters/load-character';
import { EventBus } from '@/lib/events/bus';
import { setCurrentLevel } from '@/lib/levels/current-level';
import type { Level } from '@/lib/levels/types';

import { createWallBodies } from './load-wall';

/**
 * Generic scene loader. The Level is fetched by the caller (main.ts)
 * and passed in via the constructor — Phaser's `init()` does NOT await
 * async work, so doing the fetch here would race with `preload()`.
 *
 * One scene class covers every level — there is no per-level file.
 *
 * This scene only renders the background image. Wall rendering and the
 * editor's drawing tools live in the editor panel (Konva overlay), not
 * here. Keeps the scene focused on what gameplay needs.
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

        // Lock the physics world to the level image bounds so the
        // character can't run off-screen. thickness=200 is generous so
        // corners are fully covered and a fast body can't tunnel.
        this.matter.world.setBounds(
            0,
            0,
            this.level.imageSize.width,
            this.level.imageSize.height,
            200,
        );

        // Build static Matter bodies for every air wall — see load-wall.ts
        // for category / mask policy.
        createWallBodies(this.matter, this.level.airWalls);

        // Spawn the WASD test character at the level center so the
        // designer can walk into walls and verify collision bodies.
        loadCharacter(
            this,
            this.level,
            this.level.imageSize.width / 2,
            this.level.imageSize.height / 2,
        );

        // Center camera on world so the viewport shows the middle of the
        // level when the browser window is smaller than the image.
        this.cameras.main.centerOn(
            this.level.imageSize.width / 2,
            this.level.imageSize.height / 2,
        );

        // Tell the editor panel which scene this is. Both the EventBus
        // (for panel listeners mounted before create()) and the module-
        // level cache (for lazy-loaded panels mounting after create())
        // get the payload.
        const payload = { id: this.id, level: this.level };
        setCurrentLevel(payload);
        EventBus.emit('level-loaded', payload);
        EventBus.emit('current-scene-ready', this);
    }
}