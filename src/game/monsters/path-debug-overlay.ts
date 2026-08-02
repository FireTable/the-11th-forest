/**
 * src/game/monsters/path-debug-overlay.ts
 * --------------------------------------------------------------------------
 * Editor-only visualisation of the pathfinder's grid + the per-monster
 * path being followed. Mounted in the LoadScene create() and only made
 * visible when the editor opens; production builds never see it.
 *
 *   - Background grid: light grey = walkable (grid 0), orange = buffer
 *     (grid 2), red = wall (grid 1).
 *   - Per-monster current path: cyan polyline with small dots at each
 *     waypoint. The active segment (currentWaypointIdx → +1) is
 *     highlighted in yellow.
 *   - Target slot around the player: small white circle.
 *
 * Lives in `src/game/monsters/` because it reads `m.path` /
 * `m.currentWaypointIdx` off the Monster entity — it needs to be in
 * the same module boundary as the AI logic to avoid reaching into
 * private state.
 */
import * as Phaser from 'phaser';

import type { Monster } from './monster';
import type { PathfindingService } from './logic';

export interface PathDebugOverlayHandles {
    /** Push the current monsters list + player body each frame so the
     *  overlay can redraw. Cheap: only renders when visible. */
    refresh(monsters: readonly Monster[], playerBody: MatterJS.BodyType): void;
    /** Toggle on/off — editor-open toggles this. */
    setVisible(visible: boolean): void;
    /** Cleanup on scene shutdown. */
    destroy(): void;
}

/** Build a debug overlay attached to `scene`. `pathfinder` is read for
 *  its private grid so we can paint walkable/blocked/buffer cells. */
export function createPathDebugOverlay(
    scene: Phaser.Scene,
    pathfinder: PathfindingService,
): PathDebugOverlayHandles {
    // Two Graphics objects so we can redraw the grid cheaply when
    // monsters / paths change without flashing.
    const gridGfx = scene.add.graphics();
    gridGfx.setDepth(9900);
    gridGfx.setVisible(false);

    const pathGfx = scene.add.graphics();
    pathGfx.setDepth(9901);
    pathGfx.setVisible(false);

    let visible = false;

    function drawGrid(): void {
        gridGfx.clear();
        // bracket access — the grid is intentionally an internal of
        // PathfindingService but we need it here for visualisation.
        const grid = (pathfinder as unknown as { grid: number[][] }).grid;
        const cellSize = (pathfinder as unknown as { cellSize: number }).cellSize;
        if (!grid || !cellSize) return;
        const w = grid[0]?.length ?? 0;
        const h = grid.length;
        for (let gy = 0; gy < h; gy++) {
            for (let gx = 0; gx < w; gx++) {
                const cell = grid[gy][gx];
                if (cell === 0) continue; // skip walkable to keep the overlay readable
                const x = gx * cellSize;
                const y = gy * cellSize;
                if (cell === 1) {
                    // Solid wall — translucent red overlay
                    gridGfx.fillStyle(0xef4444, 0.25);
                    gridGfx.fillRect(x, y, cellSize, cellSize);
                    gridGfx.lineStyle(1, 0xef4444, 0.6);
                    gridGfx.strokeRect(x, y, cellSize, cellSize);
                } else if (cell === 2) {
                    // Buffer zone — amber
                    gridGfx.fillStyle(0xf59e0b, 0.18);
                    gridGfx.fillRect(x, y, cellSize, cellSize);
                }
            }
        }
    }

    function drawPaths(monsters: readonly Monster[], playerBody: MatterJS.BodyType): void {
        pathGfx.clear();
        // Player target slot
        pathGfx.fillStyle(0xffffff, 0.6);
        pathGfx.fillCircle(playerBody.position.x, playerBody.position.y, 4);

        for (const m of monsters) {
            if (m.dead || m.state === 'dying') continue;
            const path = m.path;
            if (!path || path.length === 0) continue;
            const idx = m.currentWaypointIdx;
            // Whole path in cyan
            pathGfx.lineStyle(1, 0x06b6d4, 0.5);
            for (let i = 0; i < path.length - 1; i++) {
                const a = path[i];
                const b = path[i + 1];
                pathGfx.beginPath();
                pathGfx.moveTo(a.x, a.y);
                pathGfx.lineTo(b.x, b.y);
                pathGfx.strokePath();
            }
            // Active segment yellow
            if (idx + 1 < path.length) {
                const a = path[idx];
                const b = path[idx + 1];
                pathGfx.lineStyle(2, 0xfacc15, 1);
                pathGfx.beginPath();
                pathGfx.moveTo(a.x, a.y);
                pathGfx.lineTo(b.x, b.y);
                pathGfx.strokePath();
            }
            // Waypoint dots
            for (let i = 0; i < path.length; i++) {
                const wp = path[i];
                const isCurrent = i === idx;
                pathGfx.fillStyle(isCurrent ? 0xfacc15 : 0x06b6d4, 0.9);
                pathGfx.fillCircle(wp.x, wp.y, isCurrent ? 3 : 2);
            }
            // Marker at monster's own position for context — show the actual
            // body rectangle so the player can see the gap between the
            // body box and the path waypoints. (Body is a Matter
            // rectangle centred on mp, dimensions hitboxWidth ×
            // hitboxHeight.)
            const mp = m.body.position;
            const bw = m.hitboxWidth;
            const bh = m.hitboxHeight;
            pathGfx.lineStyle(1, 0xa855f7, 0.9);
            pathGfx.strokeRect(mp.x - bw / 2, mp.y - bh / 2, bw, bh);
        }
    }

    // Draw the grid once (it's static for the level). Paths are
    // refreshed per-frame.
    drawGrid();

    return {
        refresh(monsters, playerBody) {
            if (!visible) return;
            drawPaths(monsters, playerBody);
        },
        setVisible(v) {
            visible = v;
            gridGfx.setVisible(v);
            pathGfx.setVisible(v);
            if (v) drawGrid();
        },
        destroy() {
            gridGfx.destroy();
            pathGfx.destroy();
        },
    };
}