/**
 * src/game/scale/canvas-fit.ts
 * --------------------------------------------------------------------------
 * Sizes the Phaser canvas to its container.
 *
 * Phaser's own `Scale.FIT` + `CENTER_BOTH` can't be used: on mobile the
 * app is rotated 90° (see `src/lib/mobile.ts`), and Phaser measures the
 * parent with `getBoundingClientRect()` — which reports the *unrotated*
 * axis-aligned box, i.e. the swapped dimensions. So the game runs in
 * `Scale.NONE` and we drive `setZoom` ourselves from an app-space
 * measurement of `#game-container`; the container's flex box centres the
 * canvas.
 *
 * We *cover* rather than fit: a 16:9 game on a 19.5:9 phone letterboxes
 * with fat black bars, which reads as broken. Covering crops a slice of
 * the world instead — the camera follows the player, so nothing
 * gameplay-relevant lives at the very edge.
 */

import { appRect } from '@/lib/mobile';

/**
 * How far past "fit" we're willing to zoom in order to fill the box.
 * 1.35 swallows every phone aspect (16:9 → 21:9 is 1.31); past that a
 * freak window shape (e.g. 1920x600) would crop half the world, so we
 * letterboxed the remainder instead.
 */
const MAX_OVERSCAN = 1.35;

/** Zoom that makes `game` cover `box` (crops overflow, never letterboxes). */
export function coverZoom(boxW: number, boxH: number, gameW: number, gameH: number): number {
    if (boxW <= 0 || boxH <= 0 || gameW <= 0 || gameH <= 0) return 1;
    const fit = Math.min(boxW / gameW, boxH / gameH);
    const cover = Math.max(boxW / gameW, boxH / gameH);
    return Math.min(cover, fit * MAX_OVERSCAN);
}

/** Keep the canvas covering its parent. Returns a cleanup function. */
export function installCanvasFit(game: Phaser.Game): () => void {
    const parent = document.getElementById('game-container');
    if (!parent) return () => {};

    const apply = (): void => {
        const box = appRect(parent);
        game.scale.setZoom(
            coverZoom(box.width, box.height, game.scale.gameSize.width, game.scale.gameSize.height),
        );
    };

    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(parent);
    window.addEventListener('resize', apply);
    window.visualViewport?.addEventListener('resize', apply);

    return () => {
        ro.disconnect();
        window.removeEventListener('resize', apply);
        window.visualViewport?.removeEventListener('resize', apply);
    };
}
