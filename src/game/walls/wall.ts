/**
 * src/game/walls/wall.ts
 * --------------------------------------------------------------------------
 * Wall body factory — the scene-side entry point for turning level
 * air-wall polygons into static Matter bodies.
 *
 * Pure helpers (wallCategory / wallMask / triangulate) live in
 * `./logic.ts`. This file is just the assembly: take polygons →
 * Matter triangles → category+mask bodies.
 */

import * as Phaser from 'phaser';

import type { AirWall } from '@/lib/levels/types';

import { triangulate, wallCategory, wallMask } from './logic';

/**
 * Triangulate each air wall into Matter static bodies.
 *
 * Each triangle is positioned at its centroid with vertices in local
 * (centroid-relative) coordinates — Phaser's `Body.create` doesn't
 * auto-translate vertices, so without this the body would sit at the
 * world origin (0, 0) with vertices extending out to their world
 * positions, which looks like a "lump at the top-left corner" in
 * debug rendering.
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