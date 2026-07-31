/**
 * src/game/walls/logic.ts
 * --------------------------------------------------------------------------
 * Pure helpers for wall body creation. No Phaser / Matter side effects —
 * walls/wall.ts wires these into the scene.
 */

import earcut from 'earcut';

import { CAT } from '@/lib/constants';
import type { AirWallKind, AirWallVertex } from '@/lib/levels/types';

/** Matter category bit for a wall of the given kind. */
export function wallCategory(kind: AirWallKind): number {
    return kind === 'tall' ? CAT.WALL_TALL : CAT.WALL_SHORT;
}

/**
 * Collision mask for a wall: which OTHER categories it blocks. tall
 * blocks character, player bullets, monster melee, AND monster projectiles;
 * short blocks character + monster melee — bullets + projectiles pass
 * over it (the "half-wall" semantic for cover / line-of-sight tricks).
 *
 * MONSTER_MELEE is in BOTH masks so melee monsters can't walk through
 * walls the player is blocked by. Matter collision requires both
 * bodies to opt in — the monster's mask already lists WALL_TALL /
 * WALL_SHORT, but the wall's mask must reciprocate or the pair never
 * collides and the monster walks through.
 */
export function wallMask(kind: AirWallKind): number {
    const melee = CAT.CHARACTER | CAT.MONSTER_MELEE;
    return kind === 'tall'
        ? melee | CAT.BULLET | CAT.MONSTER_PROJECTILE
        : melee;
}

/**
 * Triangulate a polygon into a list of triangle vertex triples.
 * Each triple is an array of 3 [x, y] points (image-space).
 *
 * Why not Matter's `fromVertices` + poly-decomp?
 *   - poly-decomp's `quickDecomp` strips collinear vertices
 *     (removeCollinear=0.01) and drops parts below minimumArea
 *     — for a 25-vertex hand-drawn wall, that produces a smaller
 *     "convex hull + a few extra pieces" shape, not the actual
 *     polygon. The debug outline then looks like a "shrunk" version.
 *   - Triangulating to triangles bypasses the whole decomposition
 *     path. Each triangle is always convex, so `fromVertices` with
 *     3 points just works. Triangle seams are tight, so the
 *     character can't slip through.
 */
export function triangulate(points: readonly AirWallVertex[]): AirWallVertex[][] {
    const flat: number[] = [];
    for (const [x, y] of points) flat.push(x, y);
    const indices = earcut(flat);
    const triangles: AirWallVertex[][] = [];
    for (let i = 0; i < indices.length; i += 3) {
        triangles.push([points[indices[i]], points[indices[i + 1]], points[indices[i + 2]]]);
    }
    return triangles;
}