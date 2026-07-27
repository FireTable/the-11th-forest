import { AUTO, Game, Scale } from 'phaser';

import { LoadScene } from '@/game/scenes/load-scene';
import { fetchLevel, fetchLevelIndex } from '@/lib/levels';

// Scene id resolution: ?scene=<id> URL param wins; otherwise the first
// entry in public/data/levels/index.yaml. Level is fetched here (NOT in
// the scene) because Phaser's init() does not await async work — the
// fetch would race with preload().
async function resolveScene(): Promise<{ id: string; level: Awaited<ReturnType<typeof fetchLevel>> }> {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('scene');
    const id = fromUrl ?? (await fetchLevelIndex()).levels[0];
    if (!id) throw new Error('Level index is empty — add an entry to public/data/levels/index.yaml');
    const level = await fetchLevel(id);
    return { id, level };
}

const StartGame = async (parent: string): Promise<Phaser.Game> => {
    const { id, level } = await resolveScene();
    // World size matches the level's native image dimensions so air-wall
    // coords (defined in image pixel space) align 1:1. The canvas itself
    // is scaled down via Scale.FIT to fit the viewport.
    return new Game({
        type: AUTO,
        parent,
        backgroundColor: '#000000',
        scale: {
            mode: Scale.FIT,
            autoCenter: Scale.CENTER_BOTH,
            width: level.imageSize.width,
            height: level.imageSize.height,
        },
        scene: [new LoadScene(id, level)],
    });
};

export default StartGame;