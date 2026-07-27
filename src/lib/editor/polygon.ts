import type { AirWallVertex } from '@/lib/levels/types';

/**
 * src/lib/editor/polygon.ts
 * --------------------------------------------------------------------------
 * Pure polygon helpers. Lives in src/lib/editor/ because both the parser
 * (legacy rect → polygon migration) and the air-wall editor section use
 * these. The Phaser scene renders them; no Phaser types here.
 */

export interface Point {
    x: number;
    y: number;
}

/** Axis-aligned bounding box of a vertex list, or null for empty. */
export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * Convert a legacy rect to a 4-vertex polygon (clockwise from top-left).
 * Used by the parser to migrate old `x/y/width/height` YAML into the
 * new `points` schema; not used at runtime by the editor.
 */
export function rectToPoints(x: number, y: number, width: number, height: number): Point[] {
    return [
        { x, y },
        { x: x + width, y },
        { x: x + width, y: y + height },
        { x, y: y + height },
    ];
}

/**
 * Axis-aligned bounding box of a vertex list. Returns null for empty
 * (so callers can distinguish "no polygon" from "degenerate point").
 */
export function polygonBounds(points: readonly Point[]): Rect | null {
    if (points.length === 0) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of points) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Reject degenerate polygons: too few vertices, or too small to matter.
 * Default minPx=8 matches the rect-drag threshold — a polygon must span
 * at least 8px on both axes to count.
 *
 * Accepts either Point[] or AirWallVertex tuples — the data layer uses
 * tuples; rendering code may pass objects.
 */
export function isMeaningfulPolygon(
    points: readonly Point[] | readonly AirWallVertex[],
    minPx: number = 8,
): boolean {
    if (points.length < 3) return false;
    const bounds = polygonBounds(asPointList(points));
    if (!bounds) return false;
    return bounds.width >= minPx && bounds.height >= minPx;
}

/** Normalize either tuple or object vertex storage to a uniform Point[]. */
function asPointList(
    points: readonly Point[] | readonly AirWallVertex[],
): Point[] {
    return points.map((p): Point =>
        Array.isArray(p) ? { x: p[0], y: p[1] } : p,
    );
}

/**
 * Coerce any user-supplied vertex list into clean AirWallVertex tuples.
 * Snap to integers (YAML schema is integer; floats become ".4" artifacts
 * in the editor inputs).
 */
export function normalizeVertices(points: readonly Point[]): AirWallVertex[] {
    return points.map((p) => [Math.round(p.x), Math.round(p.y)] as AirWallVertex);
}