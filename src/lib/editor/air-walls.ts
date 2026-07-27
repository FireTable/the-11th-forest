/**
 * src/lib/editor/air-walls.ts
 * --------------------------------------------------------------------------
 * Pure level mutations for the air-walls editor section. All functions
 * return a new Level — input is never mutated.
 *
 * Coords are in image pixel space (see Level.imageSize); validation
 * against bounds lives in the renderer, not here.
 */

import type { AirWall, AirWallKind, Level } from '@/lib/levels/types';

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

export function addWall(
    level: Level,
    kind: AirWallKind,
    x: number,
    y: number,
    width: number,
    height: number,
): Level {
    return {
        ...level,
        airWalls: [
            ...level.airWalls,
            { id: nextWallId(level.airWalls), kind, x, y, width, height },
        ],
    };
}

export function removeWall(level: Level, id: string): Level {
    return {
        ...level,
        airWalls: level.airWalls.filter((w) => w.id !== id),
    };
}

export function moveWall(level: Level, id: string, x: number, y: number): Level {
    return {
        ...level,
        airWalls: level.airWalls.map((w) => (w.id === id ? { ...w, x, y } : w)),
    };
}

export function resizeWall(level: Level, id: string, width: number, height: number): Level {
    return {
        ...level,
        airWalls: level.airWalls.map((w) => (w.id === id ? { ...w, width, height } : w)),
    };
}

export function setWallKind(level: Level, id: string, kind: AirWallKind): Level {
    return {
        ...level,
        airWalls: level.airWalls.map((w) => (w.id === id ? { ...w, kind } : w)),
    };
}