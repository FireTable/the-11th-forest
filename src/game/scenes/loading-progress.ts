/**
 * src/game/scenes/loading-progress.ts
 * --------------------------------------------------------------------------
 * Pure helper for the fake progress bar shown while the asset loader
 * runs. Real progress from Phaser's loader is `0..1` based on file
 * bytes; users see motion only after the first chunk arrives. To avoid
 * the "frozen at 0%" perception on slow connections, we drive a
 * parallel "fake" curve that ramps to 0.85 over a few seconds — the
 * real curve catches up at the end and the bar jumps to 1.0 on
 * complete.
 *
 * Pure clock math → unit-testable without a Phaser scene.
 */

export const FAKE_STEP_MS = 80;
export const FAKE_STEP = 0.03;
export const FAKE_CAP = 0.85;

/**
 * Advance the fake-progress value by `deltaMs` of wall-clock time.
 * Caps at `FAKE_CAP` so the bar never visually "completes" before
 * the real loader does.
 */
export function nextFakeProgress(current: number, deltaMs: number): number {
    if (current >= FAKE_CAP) return current;
    const ticks = Math.floor(deltaMs / FAKE_STEP_MS);
    if (ticks <= 0) return current;
    return Math.min(FAKE_CAP, current + ticks * FAKE_STEP);
}