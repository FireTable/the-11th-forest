/**
 * src/lib/editor/air-walls.ts
 * --------------------------------------------------------------------------
 * Pure level mutations for the air-walls editor section. All functions
 * return a new Level — input is never mutated.
 *
 * Walls are polygons (`points: [x, y][]`). The old rect-style API
 * (`moveWall`/`resizeWall`) is gone — use `movePoint` / `addPoint` /
 * `removePoint` for vertex-level edits instead.
 *
 * Coords are in image pixel space (see Level.imageSize); validation
 * against bounds lives in the renderer, not here.
 */

import type { AirWall, AirWallKind, AirWallVertex, Level } from '@/lib/levels/types';

const ID_PATTERN = /^wall-(\d+)$/;

/**
 * Pick the next available `wall-N` id by scanning existing walls for
 * the highest numeric suffix. Non-`wall-N` ids are ignored.
 */
export function nextWallId(walls: AirWall[]): string {
    let max = 0;
    for (const w of walls) {
        const m = w.id.match(ID_PATTERN);
        if (m) max = Math.max(max, Number(m[1]));
    }
    return `wall-${max + 1}`;
}

/** Append a new wall with the given vertex list. Caller decides kind. */
export function addWall(level: Level, kind: AirWallKind, points: AirWallVertex[]): Level {
    return {
        ...level,
        airWalls: [
            ...level.airWalls,
            {
                id: nextWallId(level.airWalls),
                kind,
                // Deep copy: `[...points]` would still share the inner tuples,
                // so a caller mutating `points[0][0] = 999` would leak in.
                points: points.map(([x, y]) => [x, y] as AirWallVertex),
            },
        ],
    };
}

export function removeWall(level: Level, id: string): Level {
    return {
        ...level,
        airWalls: level.airWalls.filter((w) => w.id !== id),
    };
}

export function setWallKind(level: Level, id: string, kind: AirWallKind): Level {
    return {
        ...level,
        airWalls: level.airWalls.map((w) => (w.id === id ? { ...w, kind } : w)),
    };
}

/**
 * Append a vertex to the named wall. Skips duplicates of the last point
 * (clicks often produce two identical consecutive coords).
 */
export function addPoint(
    level: Level,
    id: string,
    vertex: AirWallVertex,
): Level {
    return {
        ...level,
        airWalls: level.airWalls.map((w) => {
            if (w.id !== id) return w;
            const last = w.points[w.points.length - 1];
            if (last && last[0] === vertex[0] && last[1] === vertex[1]) return w;
            return { ...w, points: [...w.points, vertex] };
        }),
    };
}

/** Remove the vertex at `index` from the named wall. No-op if out of range. */
export function removePoint(level: Level, id: string, index: number): Level {
    return {
        ...level,
        airWalls: level.airWalls.map((w) => {
            if (w.id !== id) return w;
            if (index < 0 || index >= w.points.length) return w;
            return { ...w, points: w.points.filter((_, i) => i !== index) };
        }),
    };
}

/** Move the vertex at `index` to (x, y). Coerces to integers. */
export function movePoint(
    level: Level,
    id: string,
    index: number,
    x: number,
    y: number,
): Level {
    return {
        ...level,
        airWalls: level.airWalls.map((w) => {
            if (w.id !== id) return w;
            if (index < 0 || index >= w.points.length) return w;
            return {
                ...w,
                points: w.points.map((p, i) =>
                    i === index ? [Math.round(x), Math.round(y)] as AirWallVertex : p,
                ),
            };
        }),
    };
}

/** Move all vertices of the named wall by delta (dx, dy). */
export function moveWallPolygon(
    level: Level,
    id: string,
    dx: number,
    dy: number,
): Level {
    return {
        ...level,
        airWalls: level.airWalls.map((w) => {
            if (w.id !== id) return w;
            return {
                ...w,
                points: w.points.map(([x, y]) => [Math.round(x + dx), Math.round(y + dy)] as AirWallVertex),
            };
        }),
    };
}