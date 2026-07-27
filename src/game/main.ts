import { AUTO, Game } from 'phaser';

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

// Canvas is 16:9 to match the AI-generated backgrounds.
const config: Phaser.Types.Core.GameConfig = {
    type: AUTO,
    width: 1280,
    height: 720,
    parent: 'game-container',
    backgroundColor: '#000000',
};

const StartGame = async (parent: string): Promise<Phaser.Game> => {
    const { id, level } = await resolveScene();
    return new Game({
        ...config,
        parent,
        scene: [new LoadScene(id, level)],
    });
};

export default StartGame;