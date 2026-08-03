import { AUTO, Game, Scale } from 'phaser';

import { LoadingScene } from '@/game/scenes/loading-scene';
import { cacheResolvedScene, resolveDefaultSceneId, resolveScene } from '@/game/resolve-scene';

import { PixelLightPostFX } from '@/game/pipelines/pixel-light';
import { installCanvasFit } from '@/game/scale/canvas-fit';

// Re-exported so the editor's restart path can resolve a scene id
// without going through main.ts's Phaser-side effects.
export { resolveScene } from '@/game/resolve-scene';
export type { ResolvedScene } from '@/game/resolve-scene';

const StartGame = async (parent: string): Promise<Phaser.Game> => {
    const sceneId = await resolveDefaultSceneId();
    const scene = await resolveScene(sceneId);
    // Cache so the death overlay's Restart + LoadingScene's asset queue
    // can replay without a second YAML round-trip.
    cacheResolvedScene(scene);
    // World size matches the level's native image dimensions so air-wall
    // coords (defined in image pixel space) align 1:1. The canvas is
    // scaled to the viewport by `installCanvasFit` — Scale.NONE because
    // Phaser's own FIT/CENTER can't measure the rotated mobile layout.
    const game = new Game({
        type: AUTO,
        parent,
        backgroundColor: '#000000',
        pipeline: {
            PixelLightPostFX: PixelLightPostFX,
        },
        scale: {
            mode: Scale.NONE,
            autoCenter: Scale.NO_CENTER,
            width: scene.level.imageSize.width,
            height: scene.level.imageSize.height,
        },
        // Top-down shooter — no gravity, walls are static obstacles.
        // Debug rendering off in prod; flip on for level design.
        physics: {
            default: 'matter',
            matter: {
                gravity: { x: 0, y: 0 },
                debug: false,
            },
        },
        // LoadingScene shows the progress bar, queues every asset, then
        // dynamically registers a fresh LoadScene when the loader
        // completes. Keeping LoadScene out of the boot list avoids
        // constructing it before the asset cache is warm.
        scene: [new LoadingScene()],
    } as any);

    installCanvasFit(game);
    return game;
};

export default StartGame;
