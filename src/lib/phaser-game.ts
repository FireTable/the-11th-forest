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

import { LoadScene } from '@/game/scenes/scene';
import {
    getCachedResolvedScene,
    resolveScene,
    toSceneAssets,
    type ResolvedScene,
} from '@/game/resolve-scene';
import { useGameStore } from '@/store/game-store';

let game: Phaser.Game | null = null;

export function setPhaserGame(g: Phaser.Game): void {
    game = g;
}

export function getPhaserGame(): Phaser.Game | null {
    return game;
}

/**
 * Swap the running LoadScene for a freshly-constructed one. Every asset
 * is already in the game-scoped cache, so the new scene's preload()
 * resolves on the same tick and the level is back up immediately.
 *
 * @param resolved Pre-fetched scene bundle. Caller (the API endpoint)
 *                 computes this so the UI shows a loading state while
 *                 the resolve is in flight.
 */
export async function restartSceneWith(resolved: ResolvedScene): Promise<void> {
    if (!game) {
        throw new Error('Phaser game not initialised — setPhaserGame never called');
    }

    // Drop every registered scene, not just `LoadScene:${resolved.id}`:
    // a teleport starts the next level under a different key, so keying
    // off the caller's id would leave the previous scene alive, ticking
    // behind the new one. `scenes` is mutated by remove(), hence the copy.
    //
    // `remove()` destroys the scene outright. Do NOT call `scene.stop()`
    // first: ScenePlugin.stop only *queues* an op against the scene KEY,
    // and we immediately re-register that key — so the queued stop lands
    // on the fresh scene one frame later and freezes it on arrival.
    for (const s of [...game.scene.scenes]) {
        game.scene.remove(s.sys.settings.key);
    }

    const key = `LoadScene:${resolved.id}`;
    game.scene.add(key, new LoadScene(resolved.id, resolved.level, toSceneAssets(resolved)), true);
}

/**
 * Restart the level the player is currently in, from a clean slate —
 * the shared path behind both the death overlay's and the settings
 * panel's Restart button.
 */
export function restartCurrentLevel(): void {
    const resolved = getCachedResolvedScene();
    if (!resolved) return;
    useGameStore.getState().setDead(false);
    useGameStore.getState().resetLevelProgress(resolved.id);
    void restartSceneWith(resolved);
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
