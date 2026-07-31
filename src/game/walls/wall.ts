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

import { CAT } from '@/lib/constants';
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
    imageSize?: { width: number; height: number },
): MatterJS.BodyType[] {
    const bodies: MatterJS.BodyType[] = [];

    // Outer boundary walls (thickness 200px) around image bounds so entities
    // can never be pushed outside by physics impulses.
    if (imageSize) {
        const { width, height } = imageSize;
        const thickness = 200;
        const outerFilter = {
            category: CAT.WALL_TALL,
            mask: CAT.CHARACTER | CAT.BULLET | CAT.MONSTER_MELEE | CAT.MONSTER_PROJECTILE,
        };

        // Top, Bottom, Left, Right outer walls
        bodies.push(
            matter.add.rectangle(width / 2, -thickness / 2, width + thickness * 2, thickness, {
                isStatic: true,
                label: 'wall:outer-top',
                collisionFilter: outerFilter,
            }),
            matter.add.rectangle(width / 2, height + thickness / 2, width + thickness * 2, thickness, {
                isStatic: true,
                label: 'wall:outer-bottom',
                collisionFilter: outerFilter,
            }),
            matter.add.rectangle(-thickness / 2, height / 2, thickness, height + thickness * 2, {
                isStatic: true,
                label: 'wall:outer-left',
                collisionFilter: outerFilter,
            }),
            matter.add.rectangle(width + thickness / 2, height / 2, thickness, height + thickness * 2, {
                isStatic: true,
                label: 'wall:outer-right',
                collisionFilter: outerFilter,
            }),
        );
    }

    for (const w of walls) {
        const collisionFilter = {
            category: wallCategory(w.kind),
            mask: wallMask(w.kind),
        };
        for (const tri of triangulate(w.points)) {
            const [a, b, c] = tri;
            const cx = (a[0] + b[0] + c[0]) / 3;
            const cy = (a[1] + b[1] + c[1]) / 3;
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