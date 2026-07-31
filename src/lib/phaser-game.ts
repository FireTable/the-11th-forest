/**
 * src/lib/phaser-game.ts
 * --------------------------------------------------------------------------
 * Singleton accessor for the running Phaser.Game + the in-process scene
 * restart helper the editor uses when the user clicks "jump to scene".
 *
 * Why a module-level singleton: `PhaserGame.tsx` is the only place that
 * constructs `new Phaser.Game(...)`, and the editor panel lives in a
 * separate React tree (lazy chunk). A module-level ref is the cheapest
 * bridge — no Context, no Zustand needed.
 *
 * Why in-process restart: the editor needs to feel like a normal level
 * designer tool — pick a scene, the canvas immediately shows it. URL
 * reload would land the user back in Phaser after a flash of blank page,
 * which is jarring. Phaser's `scene.add` is cheap and `init(data)` lets
 * us pass a freshly-resolved scene spec bundle.
 */

import { resolveScene, type ResolvedScene } from '@/game/resolve-scene';

let game: Phaser.Game | null = null;

export function setPhaserGame(g: Phaser.Game): void {
    game = g;
}

export function getPhaserGame(): Phaser.Game | null {
    return game;
}

/**
 * Stop every running scene and start a fresh LoadScene for `newId`.
 * Caller has already saved any pending edits — this is the final step
 * after the user clicks "Jump to scene".
 *
 * @param resolved Pre-fetched scene bundle. Caller (the API endpoint)
 *                 computes this so the UI shows a loading state while
 *                 the resolve is in flight.
 */
export async function restartSceneWith(resolved: ResolvedScene): Promise<void> {
    if (!game) {
        throw new Error('Phaser game not initialised — setPhaserGame never called');
    }

    // Stop every active scene (calls shutdown() on each). Running scenes
    // by themselves so paused/menu ones are left alone.
    const active = game.scene.getScenes(true);
    for (const s of active) {
        s.scene.stop();
    }

    // Dynamic import so the editor's restart path doesn't pull in Phaser
    // scene code into its lazy chunk.
    const { LoadScene } = await import('@/game/scenes/scene');
    game.scene.add(
        `LoadScene:${resolved.id}`,
        new LoadScene(resolved.id, resolved.level, {
            weapons: resolved.weapons,
            weaponsById: resolved.weaponsById,
            character: resolved.character,
            spriteCell: resolved.spriteCell,
            monsterSpecs: resolved.monsters,
            dropSpecs: resolved.drops,
            sfxSpecs: resolved.sfx,
            musicSpecs: resolved.music,
        }),
        true,
    );
}

/**
 * Convenience: resolve by id then restart. Use this from the UI; the
 * API endpoint uses `resolveScene` directly so it can return a 400 on
 * bad id without calling into Phaser.
 */
export async function resolveAndRestart(newId: string): Promise<void> {
    const resolved = await resolveScene(newId);
    await restartSceneWith(resolved);
}