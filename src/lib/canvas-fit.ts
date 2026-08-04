/**
 * src/lib/canvas-fit.ts
 * --------------------------------------------------------------------------
 * Sizes the Phaser canvas to its container using FULL-VIEW (fitZoom).
 *
 * Guaranteed Full View:
 * 1. Shows 100% of the game map and HUD elements without cropping any edges.
 * 2. Maintains original pixel aspect ratio (never stretches or distorts).
 * 3. Handles mobile rotation & visualViewport changes smoothly.
 * 4. High Performance: Uses rAF throttling to avoid Layout Thrashing.
 */

import { EventBus } from '@/lib/events/bus';
import { appRect } from '@/lib/mobile';

/** Zoom that makes `game` fit entirely inside `box` (shows 100% full map, never crops). */
export function fitZoom(boxW: number, boxH: number, gameW: number, gameH: number): number {
    if (boxW <= 0 || boxH <= 0 || gameW <= 0 || gameH <= 0) return 1;
    return Math.min(boxW / gameW, boxH / gameH);
}

/** Keep the canvas fitting its parent with 100% full visibility. Returns a cleanup function. */
export function installCanvasFit(game: Phaser.Game): () => void {
    const parent = document.getElementById('game-container');
    if (!parent) return () => { };

    let rafId: number | null = null;
    let lastWidth = 0;
    let lastHeight = 0;

    const apply = (): void => {
        rafId = null;

        const box = appRect(parent);
        const gameSize = game.scale?.gameSize;

        if (!gameSize) return;

        // Skip when dimensions unchanged — no point re-reading the DOM
        // or re-running Phaser's refresh pipeline.
        if (box.width === lastWidth && box.height === lastHeight) {
            return;
        }

        lastWidth = box.width;
        lastHeight = box.height;

        // fitZoom everywhere — 100% full view, never crops top/bottom or sides.
        const zoom = fitZoom(
            box.width,
            box.height,
            gameSize.width,
            gameSize.height,
        );

        if (game.scale) {
            game.scale.setZoom(zoom);

            if (typeof game.scale.updateBounds === 'function') {
                game.scale.updateBounds();
            }
            if (typeof game.scale.refresh === 'function') {
                game.scale.refresh();
            }

            // Sync canvasBounds to the actual DOM canvas rect so Phaser's
            // Input/Pointer coordinate mapping stays accurate.
            const phaserCanvas = parent.querySelector<HTMLCanvasElement>(':scope > canvas');
            if (phaserCanvas && game.scale.canvasBounds) {
                const rect = phaserCanvas.getBoundingClientRect();
                game.scale.canvasBounds.setTo(rect.left, rect.top, rect.width, rect.height);
            }
        }
    };

    // rAF throttle — at most one apply per frame; eliminates redundant reflows.
    const scheduleApply = (): void => {
        if (rafId !== null) return;
        rafId = requestAnimationFrame(apply);
    };

    // Force-refresh (used by level load / editor-open state pushes that
    // need to bypass the unchanged-dim early return).
    const forceScheduleApply = (): void => {
        lastWidth = 0;
        lastHeight = 0;
        scheduleApply();
    };

    // 1. Initial application
    scheduleApply();

    // 2. Watch the parent container's size (NEVER the canvas itself —
    // that would loop, since scaling the canvas changes its rect).
    const ro = new ResizeObserver(scheduleApply);
    ro.observe(parent);

    // 3. Event listeners
    EventBus.on('editor-open', forceScheduleApply);
    EventBus.on('level-loaded', forceScheduleApply);

    window.addEventListener('resize', scheduleApply);
    window.visualViewport?.addEventListener('resize', scheduleApply);

    return () => {
        if (rafId !== null) {
            cancelAnimationFrame(rafId);
        }
        ro.disconnect();
        EventBus.removeListener('editor-open', forceScheduleApply);
        EventBus.removeListener('level-loaded', forceScheduleApply);
        window.removeEventListener('resize', scheduleApply);
        window.visualViewport?.removeEventListener('resize', scheduleApply);
    };
}
