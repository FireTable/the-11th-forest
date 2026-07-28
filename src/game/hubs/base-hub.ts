/**
 * src/game/hubs/base-hub.ts
 * --------------------------------------------------------------------------
 * Shared helpers for any HUD container drawn on the Phaser canvas.
 *
 * Scale.FIT shrinks the game world to fit the viewport — but HUDs want to
 * look the same on every screen size. The trick: anchor the HUD container
 * in world coords (= screen_pos / fitScale) and apply setScale(1/fitScale).
 * Children can then be drawn at literal screen-pixel sizes and they appear
 * at the intended size regardless of the world-vs-display ratio.
 *
 * Kept tiny on purpose: this is the only HUD-shared logic, nothing more.
 */

import * as Phaser from 'phaser';

/** FIT scale ratio the engine applies between gameSize and displaySize. */
export function hudFitScale(scene: Phaser.Scene): number {
    return Math.min(
        scene.scale.displaySize.width / scene.scale.gameSize.width,
        scene.scale.displaySize.height / scene.scale.gameSize.height,
    );
}

/**
 * Anchor a HUD container at a screen-space position with the
 * scale-compensated transform described above.
 */
export function makeScreenAnchoredContainer(
    scene: Phaser.Scene,
    screenX: number,
    screenY: number,
    depth = 800,
): { container: Phaser.GameObjects.Container; invScale: number } {
    const invScale = 1 / hudFitScale(scene);
    const container = scene.add.container(screenX * invScale, screenY * invScale);
    container.setScale(invScale);
    container.setDepth(depth);
    return { container, invScale };
}