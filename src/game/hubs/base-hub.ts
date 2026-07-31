/**
 * src/game/hubs/base-hub.ts
 * --------------------------------------------------------------------------
 * Base class for any HUD drawn on the Phaser canvas.
 *
 * Scale.FIT shrinks the game world to fit the viewport — but HUDs want to
 * look the same on every screen size. The trick: anchor the HUD container
 * in world coords (= screen_pos / fitScale) and apply setScale(1/fitScale).
 * Children can then be drawn at literal screen-pixel sizes and they appear
 * at the intended size regardless of the world-vs-display ratio.
 *
 * Subclasses inherit the container + destroy plumbing and only need to
 * focus on their specific elements (bars, slots, hotbar, etc.).
 */

/** FIT scale ratio the engine applies between gameSize and displaySize. */
function hudFitScale(scene: Phaser.Scene): number {
    return Math.min(
        scene.scale.displaySize.width / scene.scale.gameSize.width,
        scene.scale.displaySize.height / scene.scale.gameSize.height,
    );
}

/**
 * Anchor a HUD container at a screen-space position with the
 * scale-compensated transform. Returns the container; the invScale is
 * exposed for callers that need to place children at literal screen
 * pixel sizes inside it.
 */
function makeScreenAnchoredContainer(
    scene: Phaser.Scene,
    screenX: number,
    screenY: number,
    depth: number,
): Phaser.GameObjects.Container {
    const invScale = 1 / hudFitScale(scene);
    const container = scene.add.container(screenX * invScale, screenY * invScale);
    container.setScale(invScale);
    container.setDepth(depth);
    return container;
}

export class BaseHud {
    protected readonly root: Phaser.GameObjects.Container;
    protected readonly scene: Phaser.Scene;

    constructor(
        scene: Phaser.Scene,
        screenX: number,
        screenY: number,
        depth = 800,
    ) {
        this.scene = scene;
        this.root = makeScreenAnchoredContainer(scene, screenX, screenY, depth);
    }

    destroy(): void {
        this.root.destroy();
    }

    /** Toggle visibility of the HUD and all its children. */
    setVisible(visible: boolean): void {
        this.root.setVisible(visible);
    }
}