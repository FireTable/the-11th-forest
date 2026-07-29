import { describe, it, expect } from 'vitest';

import type { AirWall, AirWallVertex, Level } from '@/lib/levels/types';

import {
    addPoint,
    addWall,
    movePoint,
    nextWallId,
    removePoint,
    removeWall,
    setWallKind,
} from '@/lib/editor/air-walls';

const base: Level = {
    title: 't',
    background: 'b',
    imageSize: { width: 100, height: 100 },
    airWalls: [],
};

/** Fresh triangle each call — tests must not mutate a shared fixture. */
function freshTri(): AirWallVertex[] {
    return [
        [10, 20],
        [40, 20],
        [25, 60],
    ];
}

describe('nextWallId', () => {
    it('starts at wall-1 for an empty list', () => {
        expect(nextWallId([])).toBe('wall-1');
    });

    it('increments past the highest existing numeric suffix', () => {
        const walls: AirWall[] = [
            { id: 'wall-1', kind: 'tall', points: [[0, 0], [1, 0], [1, 1]] },
            { id: 'wall-3', kind: 'short', points: [[0, 0], [1, 0], [1, 1]] },
        ];
        expect(nextWallId(walls)).toBe('wall-4');
    });

    it('ignores non-numeric ids when picking the suffix', () => {
        const walls: AirWall[] = [
            { id: 'custom-7', kind: 'tall', points: [[0, 0], [1, 0], [1, 1]] },
        ];
        expect(nextWallId(walls)).toBe('wall-1');
    });
});

describe('addWall', () => {
    it('appends a polygon with auto id', () => {
        const pts = freshTri();
        const out = addWall(base, 'tall', pts);
        expect(out.airWalls).toHaveLength(1);
        expect(out.airWalls[0]).toEqual({
            id: 'wall-1',
            kind: 'tall',
            points: pts,
        });
    });

    it('copies the input points so external mutations cannot leak in', () => {
        const pts = freshTri();
        const out = addWall(base, 'tall', pts);
        pts[0][0] = 999;
        expect(out.airWalls[0].points[0]).toEqual([10, 20]);
    });

    it('does not mutate the input level', () => {
        addWall(base, 'tall', freshTri());
        expect(base.airWalls).toEqual([]);
    });
});

describe('removeWall', () => {
    it('drops the wall with the matching id', () => {
        const seeded = addWall(addWall(base, 'tall', freshTri()), 'short', freshTri());
        const out = removeWall(seeded, 'wall-1');
        expect(out.airWalls).toHaveLength(1);
        expect(out.airWalls[0].id).toBe('wall-2');
    });

    it('returns equivalent content when id not found', () => {
        const out = removeWall(base, 'wall-99');
        expect(out.airWalls).toEqual([]);
    });
});

describe('setWallKind', () => {
    it('updates kind of the matching wall only', () => {
        const a = addWall(base, 'tall', freshTri());
        const seeded = addWall(a, 'short', freshTri());
        const out = setWallKind(seeded, 'wall-1', 'short');
        expect(out.airWalls[0].kind).toBe('short');
        expect(out.airWalls[1].kind).toBe('short');
    });
});

describe('addPoint', () => {
    it('appends a vertex to the matching wall', () => {
        const seeded = addWall(base, 'tall', freshTri());
        const out = addPoint(seeded, 'wall-1', [50, 70]);
        expect(out.airWalls[0].points).toHaveLength(4);
        expect(out.airWalls[0].points[3]).toEqual([50, 70]);
    });

    it('skips a duplicate of the last vertex', () => {
        const tri = freshTri();
        const seeded = addWall(base, 'tall', tri);
        const out = addPoint(seeded, 'wall-1', [...tri[2]]);
        expect(out.airWalls[0].points).toHaveLength(3);
    });

    it('leaves other walls untouched', () => {
        const a = addWall(base, 'tall', freshTri());
        const seeded = addWall(a, 'short', freshTri());
        const out = addPoint(seeded, 'wall-2', [99, 99]);
        expect(out.airWalls[1].points).toHaveLength(4);
    });
});

describe('removePoint', () => {
    it('removes the vertex at the given index', () => {
        const seeded = addWall(base, 'tall', freshTri());
        const out = removePoint(seeded, 'wall-1', 1);
        expect(out.airWalls[0].points).toEqual([
            [10, 20],
            [25, 60],
        ]);
    });

    it('no-ops when index is out of range', () => {
        const tri = freshTri();
        const seeded = addWall(base, 'tall', tri);
        const out = removePoint(seeded, 'wall-1', 99);
        expect(out.airWalls[0].points).toEqual(tri);
    });
});

describe('movePoint', () => {
    it('moves the vertex at the given index and rounds to integers', () => {
        const seeded = addWall(base, 'tall', freshTri());
        const out = movePoint(seeded, 'wall-1', 1, 100.6, 200.4);
        expect(out.airWalls[0].points[1]).toEqual([101, 200]);
    });

    it('no-ops when index is out of range', () => {
        const tri = freshTri();
        const seeded = addWall(base, 'tall', tri);
        const out = movePoint(seeded, 'wall-1', 99, 1, 2);
        expect(out.airWalls[0].points).toEqual(tri);
    });
});