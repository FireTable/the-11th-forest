import { describe, it, expect } from 'vitest';

import { CAT } from '@/lib/constants';
import { triangulate, wallCategory } from '@/game/scenes/load-wall';
import type { AirWallVertex } from '@/lib/levels/types';

describe('wallCategory', () => {
    it('maps tall → WALL_TALL', () => {
        expect(wallCategory('tall')).toBe(CAT.WALL_TALL);
    });

    it('maps short → WALL_SHORT', () => {
        expect(wallCategory('short')).toBe(CAT.WALL_SHORT);
    });

    it('tall and short use distinct bits', () => {
        // Bitwise AND must be 0 — otherwise the categories overlap and
        // short walls would inherit tall-wall collision rules.
        expect(wallCategory('tall') & wallCategory('short')).toBe(0);
    });
});

describe('triangulate', () => {
    it('returns a single triangle for a 3-vertex polygon', () => {
        const tris = triangulate([
            [0, 0],
            [10, 0],
            [5, 10],
        ]);
        expect(tris).toHaveLength(1);
        expect(tris[0]).toHaveLength(3);
    });

    it('returns 2 triangles for a 4-vertex convex polygon (square)', () => {
        const tris = triangulate([
            [0, 0],
            [10, 0],
            [10, 10],
            [0, 10],
        ]);
        expect(tris).toHaveLength(2);
        // Every triangle references input vertices (no new points).
        for (const tri of tris) {
            for (const [x, y] of tri) {
                expect([0, 10]).toContain(x);
                expect([0, 10]).toContain(y);
            }
        }
    });

    it('returns n-2 triangles for an n-vertex simple polygon', () => {
        const pentagon: AirWallVertex[] = [
            [0, 0],
            [20, 0],
            [25, 15],
            [10, 25],
            [-5, 15],
        ];
        expect(triangulate(pentagon)).toHaveLength(3);
    });

    it('handles a concave polygon (the demo 25-vertex hand-drawn wall)', () => {
        // A subset of the actual sacred-forest-sanctuary wall-1 vertices.
        const concave: AirWallVertex[] = [
            [10, 676],
            [86, 726],
            [94, 771],
            [157, 801],
            [171, 825],
            [227, 871],
            [321, 877],
            [385, 891],
            [389, 915],
            [397, 953],
        ];
        const tris = triangulate(concave);
        // Every triangle should be 3 input vertices, no extras.
        for (const tri of tris) {
            expect(tri).toHaveLength(3);
            for (const [x, y] of tri) {
                expect(concave.some(([vx, vy]) => vx === x && vy === y)).toBe(true);
            }
        }
    });
});