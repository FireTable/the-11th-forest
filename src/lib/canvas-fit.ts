/**
 * src/lib/canvas-fit.ts
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

import { EventBus } from '@/lib/events/bus';
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

/** Zoom that makes `game` fit entirely inside `box` (shows 100% full map, never crops). */
export function fitZoom(boxW: number, boxH: number, gameW: number, gameH: number): number {
    if (boxW <= 0 || boxH <= 0 || gameW <= 0 || gameH <= 0) return 1;
    return Math.min(boxW / gameW, boxH / gameH);
}

/** Keep the canvas covering or fitting its parent. Returns a cleanup function. */
export function installCanvasFit(game: Phaser.Game): () => void {
    const parent = document.getElementById('game-container');
    if (!parent) return () => {};

    let isUpdating = false;
    let isEditorOpen = false;

    const apply = (): void => {
        if (isUpdating) return;
        isUpdating = true;
        try {
            const box = appRect(parent);
            const zoom = isEditorOpen
                ? fitZoom(
                      box.width,
                      box.height,
                      game.scale.gameSize.width,
                      game.scale.gameSize.height,
                  )
                : coverZoom(
                      box.width,
                      box.height,
                      game.scale.gameSize.width,
                      game.scale.gameSize.height,
                  );
            game.scale.setZoom(zoom);
            if (typeof game.scale?.updateBounds === 'function') {
                game.scale.updateBounds();
            }
            if (typeof game.scale?.refresh === 'function') {
                game.scale.refresh();
            }
            // Explicitly sync canvasBounds rectangle with actual DOM canvas bounding rect
            const phaserCanvas = parent.querySelector<HTMLCanvasElement>(':scope > canvas');
            if (phaserCanvas && game.scale?.canvasBounds) {
                const rect = phaserCanvas.getBoundingClientRect();
                game.scale.canvasBounds.setTo(rect.left, rect.top, rect.width, rect.height);
            }
        } finally {
            isUpdating = false;
        }
    };

    const scheduleApply = (): void => {
        apply();
        if (typeof window !== 'undefined') {
            requestAnimationFrame(() => {
                apply();
                requestAnimationFrame(apply);
            });
            setTimeout(apply, 50);
            setTimeout(apply, 150);
            setTimeout(apply, 300);
        }
    };

    scheduleApply();

    const ro = new ResizeObserver(scheduleApply);
    ro.observe(parent);

    const canvas = parent.querySelector('canvas');
    if (canvas) {
        ro.observe(canvas);
    }

    const onEditorOpen = (open: unknown) => {
        isEditorOpen = open === true;
        scheduleApply();
    };

    EventBus.on('editor-open', onEditorOpen);
    EventBus.on('level-loaded', scheduleApply);

    window.addEventListener('resize', scheduleApply);
    window.visualViewport?.addEventListener('resize', scheduleApply);
    parent.addEventListener('pointerdown', apply, { capture: true });

    return () => {
        ro.disconnect();
        EventBus.removeListener('editor-open', onEditorOpen);
        EventBus.removeListener('level-loaded', scheduleApply);
        window.removeEventListener('resize', scheduleApply);
        window.visualViewport?.removeEventListener('resize', scheduleApply);
        parent.removeEventListener('pointerdown', apply, { capture: true });
    };
}
