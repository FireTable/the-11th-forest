import earcut from 'earcut';
import * as Phaser from 'phaser';

import { CAT } from '@/lib/constants';
import type { AirWall, AirWallKind, AirWallVertex } from '@/lib/levels/types';

/** Matter category bit for a wall of the given kind. */
export function wallCategory(kind: AirWallKind): number {
    return kind === 'tall' ? CAT.WALL_TALL : CAT.WALL_SHORT;
}

/**
 * Collision mask for a wall: which OTHER categories it blocks. tall
 * blocks both character and bullets; short blocks character only —
 * bullets pass over it (the gameplay semantic).
 */
export function wallMask(kind: AirWallKind): number {
    return kind === 'tall' ? CAT.CHARACTER | CAT.BULLET : CAT.CHARACTER;
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

/**
 * Build static Matter bodies for every wall. Each wall is split into
 * triangles (via earcut) and one static body is created per triangle.
 *
 * Each triangle body is positioned at the triangle's centroid with
 * vertices expressed in local (centroid-relative) coordinates — Phaser's
 * `Body.create` doesn't auto-translate vertices, so without this the
 * body would sit at the world origin (0, 0) with vertices extending
 * out to their world positions, which looks like a "lump at the top-left
 * corner" in debug rendering.
 *
 * Returns a flat array of bodies. The bodies share the wall's kind
 * via the collision category bit, so e.g. all triangles of a `tall`
 * wall block both character and bullet equally.
 */
export function createWallBodies(
    matter: Phaser.Physics.Matter.MatterPhysics,
    walls: readonly AirWall[],
): MatterJS.BodyType[] {
    const bodies: MatterJS.BodyType[] = [];
    for (const w of walls) {
        const collisionFilter = {
            category: wallCategory(w.kind),
            mask: wallMask(w.kind),
        };
        for (const tri of triangulate(w.points)) {
            const [a, b, c] = tri;
            // Centroid of a 3-vertex triangle is the simple average.
            const cx = (a[0] + b[0] + c[0]) / 3;
            const cy = (a[1] + b[1] + c[1]) / 3;
            // Local-space vertices (relative to centroid), so when
            // Matter combines body.position + vertex, the world
            // position lands at the original input point.
            const verts = [
                { x: a[0] - cx, y: a[1] - cy },
                { x: b[0] - cx, y: b[1] - cy },
                { x: c[0] - cx, y: c[1] - cy },
            ];
            bodies.push(
                matter.add.fromVertices(cx, cy, verts, {
                    isStatic: true,
                    label: `wall:${w.id}`,
                    collisionFilter,
                }),
            );
        }
    }
    return bodies;
}