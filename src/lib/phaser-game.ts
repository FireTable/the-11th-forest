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

import { LoadingScene } from '@/game/scenes/loading-scene';
import { resolveScene, type ResolvedScene } from '@/game/resolve-scene';

let game: Phaser.Game | null = null;

export function setPhaserGame(g: Phaser.Game): void {
    game = g;
}

export function getPhaserGame(): Phaser.Game | null {
    return game;
}

/**
 * Stop the dead LoadScene and re-launch LoadingScene, which sees all
 * assets already cached and fires `complete` immediately, then adds a
 * fresh LoadScene with full HP.
 *
 * We deliberately do NOT `scene.remove()` the LoadingScene instance:
 * in production builds removing it appears to evict the texture cache
 * (texture missing → black background + invisible character), even
 * though the docs say the cache is game-scoped. Re-starting the
 * existing LoadingScene avoids touching its lifecycle state.
 *
 * @param resolved Pre-fetched scene bundle. Caller (the API endpoint)
 *                 computes this so the UI shows a loading state while
 *                 the resolve is in flight.
 */
export async function restartSceneWith(resolved: ResolvedScene): Promise<void> {
    if (!game) {
        throw new Error('Phaser game not initialised — setPhaserGame never called');
    }

    // Stop + remove only the dead LoadScene (paused). LoadingScene stays
    // registered so its already-cached texture references survive.
    const deadKey = `LoadScene:${resolved.id}`;
    const dead = game.scene.getScene(deadKey);
    if (dead) {
        dead.scene.stop();
        game.scene.remove(deadKey);
    }

    // Re-launch the existing LoadingScene. Its queueAssets() re-adds
    // already-cached assets, the loader fires 'complete' immediately,
    // and the on-complete handler adds a fresh LoadScene with full HP.
    const loader = game.scene.getScene('LoadingScene');
    if (loader) {
        loader.scene.start();
    } else {
        // LoadingScene was somehow never registered — bootstrap a fresh
        // one. Shouldn't happen on a normal boot path.
        game.scene.add('LoadingScene', new LoadingScene(), true);
    }
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