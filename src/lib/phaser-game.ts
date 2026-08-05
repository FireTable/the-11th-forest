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

    // Wipe the per-run entity snapshots BEFORE the new scene's
    // loadCharacter() reads them. Without this, the character spawns
    // at the last position the player had in the previous scene
    // (saved by tickSaveState every 1s and persisted to localStorage
    // via zustand), not at the new scene's characterSpawn. Symptom:
    // switching scenes via Jump shows the new background + air walls
    // but the character is at a stale position from the prior scene
    // — looks like "the scene didn't refresh".
    //
    // Use the snapshot-only clear (NOT resetLevelProgress which also
    // wipes hp/sp/slots) — scene transitions must preserve the
    // player's progress: picked-up weapons, current health, selected
    // character. The snapshot triple is the only thing that should
    // reset per-scene.
    useGameStore.getState().clearSceneSnapshots();

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
 * Restart from the tavern — a full reset. Used by the death
 * overlay and the settings panel as the "back to the beginning"
 * path. `clearSaveData` wipes the persisted localStorage and
 * resets the store to `initialGameState` in one shot (isDead →
 * false, selectedCharacterId → null, tavernCleared → false, slots
 * → [], all three entity snapshots → undefined, hp/sp/currentLevelId
 * → zero/empty), so the next page load lands in the tavern phase-1
 * NPC selection with no stale snapshot restoring mid-fight.
 *
 * Order matters: pause running scenes BEFORE clearSaveData. The
 * old scene's per-frame CharacterController.update() calls
 * weaponHud.draw() → setWeaponStats({ slots }) which writes the
 * previous run's weapons back into the store. If we clear first,
 * the next frame's HUD draw overwrites our clean state with stale
 * weapons. Pausing stops the writer loop; restartSceneWith below
 * removes the scenes outright (paused scenes are still destroyed
 * by scene.remove).
 */
export async function restartAtTavern(): Promise<void> {
    const game = getPhaserGame();
    game?.pause()
    useGameStore.getState().clearSaveData();
    // const resolved = await resolveScene('tavern');
    // await restartSceneWith(resolved);
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
