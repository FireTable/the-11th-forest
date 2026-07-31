import { AUTO, Game, Scale } from 'phaser';

import { LoadScene } from '@/game/scenes/scene';
import { resolveDefaultSceneId, resolveScene } from '@/game/resolve-scene';

import { PixelLightPostFX } from '@/game/pipelines/pixel-light';

// Re-exported so the editor's restart path can resolve a scene id
// without going through main.ts's Phaser-side effects.
export { resolveScene } from '@/game/resolve-scene';
export type { ResolvedScene } from '@/game/resolve-scene';

const StartGame = async (parent: string): Promise<Phaser.Game> => {
    const sceneId = await resolveDefaultSceneId();
    const scene = await resolveScene(sceneId);
    // World size matches the level's native image dimensions so air-wall
    // coords (defined in image pixel space) align 1:1. The canvas itself
    // is scaled down via Scale.FIT to fit the viewport.
    return new Game({
        type: AUTO,
        parent,
        backgroundColor: '#000000',
        pipeline: {
            'PixelLightPostFX': PixelLightPostFX,
        },
        scale: {
            mode: Scale.FIT,
            autoCenter: Scale.CENTER_BOTH,
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
        scene: [new LoadScene(scene.id, scene.level, {
            weapons: scene.weapons,
            weaponsById: scene.weaponsById,
            character: scene.character,
            spriteCell: scene.spriteCell,
            monsterSpecs: scene.monsters,
            dropSpecs: scene.drops,
            sfxSpecs: scene.sfx,
            musicSpecs: scene.music,
        })],
    } as any);
};

export default StartGame;
