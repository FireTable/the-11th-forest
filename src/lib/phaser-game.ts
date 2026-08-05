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

    // Drop every registered scene: pause first to stop update loops,
    // then remove to destroy them outright.
    for (const s of [...game.scene.scenes]) {
        s.scene.pause();
        game.scene.remove(s.sys.settings.key);
    }

    // Wipe the per-run entity snapshots AFTER old scenes are removed
    // so no destroy/shutdown handlers write stale state back into store.
    useGameStore.getState().clearSceneSnapshots();

    const key = `LoadScene:${resolved.id}`;
    const newScene = game.scene.add(key, new LoadScene(resolved.id, resolved.level, toSceneAssets(resolved)), true);

    // Ensure the newly added scene is active and unpaused
    newScene?.scene.resume();
}

/**
 * Restart the level the player is currently in, from a clean slate.
 * Not currently wired to any UI button — both the death overlay and
 * the settings panel route through `restartAtTavern` instead. Kept
 * for a future "retry this level" option that preserves the chosen
 * character + weapons while resetting combat state.
 */
export function restartCurrentLevel(): void {
    const resolved = getCachedResolvedScene();
    if (!resolved) return;
    useGameStore.getState().setDead(false);
    useGameStore.getState().resetLevelProgress(resolved.id);
    void restartSceneWith(resolved);
}

/**
 * Full reset: wipes store & localStorage, then loads fresh tavern scene.
 */
export async function restartAtTavern(): Promise<void> {
    const resolved = await resolveScene('tavern');

    // 1. Remove old scenes completely
    if (game) {
        for (const s of [...game.scene.scenes]) {
            game.scene.remove(s.sys.settings.key);
        }
    }

    // 2. Clear state ONLY AFTER old scenes are completely destroyed
    useGameStore.getState().clearSaveData();

    // 3. Start fresh tavern scene and force resume in case game was paused
    if (game) {
        const key = `LoadScene:${resolved.id}`;
        const newScene = game.scene.add(key, new LoadScene(resolved.id, resolved.level, toSceneAssets(resolved)), true);
        newScene?.scene.resume();
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
