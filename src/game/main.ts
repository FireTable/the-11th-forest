import { AUTO, Game, Scale } from 'phaser';

import { LoadScene } from '@/game/scenes/scene';
import {
    cacheResolvedScene,
    resolveDefaultSceneId,
    resolveScene,
    toSceneAssets,
} from '@/game/resolve-scene';

import { PixelLightPostFX } from '@/game/pipelines/pixel-light';
import { installCanvasFit } from '@/lib/canvas-fit';

import { useGameStore } from '@/store/game-store';

// Re-exported so the editor's restart path can resolve a scene id
// without going through main.ts's Phaser-side effects.
export { resolveScene } from '@/game/resolve-scene';
export type { ResolvedScene } from '@/game/resolve-scene';

const StartGame = async (parent: string): Promise<Phaser.Game> => {
    const { tavernCleared, currentLevelId } = useGameStore.getState();

    let scene;
    if (!tavernCleared) {
        // First launch or after a full reset: always start in the tavern.
        try {
            scene = await resolveScene('tavern');
        } catch {
            // Tavern YAML not yet created — fall back to normal flow.
            const defaultId = await resolveDefaultSceneId();
            scene = await resolveScene(defaultId);
        }
    } else if (currentLevelId) {
        try {
            scene = await resolveScene(currentLevelId);
        } catch {
            const defaultId = await resolveDefaultSceneId();
            scene = await resolveScene(defaultId);
        }
    } else {
        const defaultId = await resolveDefaultSceneId();
        scene = await resolveScene(defaultId);
    }

    useGameStore.getState().setCurrentLevelId(scene.id);
    // Cache so the death overlay's Restart can replay without a second
    // YAML round-trip.
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
        // LoadScene queues every asset in its own preload(). The boot
        // splash in index.html stays up until it emits
        // `current-scene-ready`, so no in-canvas loading UI is needed.
        scene: [new LoadScene(scene.id, scene.level, toSceneAssets(scene))],
    } as any);

    installCanvasFit(game);
    return game;
};

export default StartGame;
