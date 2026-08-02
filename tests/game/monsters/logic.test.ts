import { describe, expect, it } from 'vitest';

import {
    chaseVelocity,
    decideAIState,
    dirTo,
    distBetween,
    pickClosestMonster,
    PathfindingService,
    calcSeparationForce,
    getSurroundOffset,
    getPathLookAheadPoint,
} from '@/game/monsters/logic';

describe('monsters/logic — decideAIState', () => {
    it('returns attack when in range', () => {
        expect(decideAIState(30, 36)).toBe('attack');
        expect(decideAIState(0, 36)).toBe('attack');
    });

    it('returns chase when out of range', () => {
        expect(decideAIState(40, 36)).toBe('chase');
    });
});

describe('monsters/logic — distBetween', () => {
    it('returns Euclidean distance', () => {
        expect(distBetween({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
        expect(distBetween({ x: 0, y: 0 }, { x: 0, y: 0 })).toBe(0);
    });

    it('is direction-agnostic', () => {
        const d = distBetween({ x: 1, y: 2 }, { x: 4, y: 6 });
        expect(d).toBeCloseTo(5);
    });
});

describe('monsters/logic — dirTo', () => {
    it('returns unit vector toward target', () => {
        expect(dirTo({ x: 0, y: 0 }, { x: 10, y: 0 })).toEqual({ x: 1, y: 0 });
        expect(dirTo({ x: 0, y: 0 }, { x: 0, y: -5 })).toEqual({ x: 0, y: -1 });
    });

    it('returns zero vector when points coincide', () => {
        expect(dirTo({ x: 1, y: 1 }, { x: 1, y: 1 })).toEqual({ x: 0, y: 0 });
    });

    it('normalises diagonal inputs', () => {
        const d = dirTo({ x: 0, y: 0 }, { x: 3, y: 4 });
        expect(d.x).toBeCloseTo(0.6);
        expect(d.y).toBeCloseTo(0.8);
    });
});

describe('monsters/logic — chaseVelocity', () => {
    it('scales direction by move speed', () => {
        expect(chaseVelocity({ x: 1, y: 0 }, 5)).toEqual({ vx: 5, vy: 0 });
        expect(chaseVelocity({ x: 0, y: -1 }, 3)).toEqual({ vx: 0, vy: -3 });
    });
});

describe('monsters/logic — pickClosestMonster', () => {
    type Stub = { dead: boolean; body: { position: { x: number; y: number } } };

    const mk = (x: number, y: number, dead = false): Stub => ({
        dead,
        body: { position: { x, y } },
    });

    it('returns null when list is empty', () => {
        expect(pickClosestMonster({ x: 0, y: 0 }, [], 100)).toBeNull();
    });

    it('returns null when nothing within maxDist', () => {
        const list = [mk(500, 500)];
        expect(pickClosestMonster({ x: 0, y: 0 }, list, 100)).toBeNull();
    });

    it('skips dead monsters', () => {
        const list = [mk(0, 0, true)];
        expect(pickClosestMonster({ x: 0, y: 0 }, list, 100)).toBeNull();
    });

    it('returns the nearest alive monster within range', () => {
        const far = mk(80, 0);
        const near = mk(10, 0);
        const list = [far, near];
        const r = pickClosestMonster({ x: 0, y: 0 }, list, 100);
        expect(r).toBe(near);
    });
});

describe('monsters/logic — PathfindingService', () => {
    it('bypasses wall obstacles using A* pathfinding', () => {
        // 100x100 world with a vertical air wall in the middle (x=40..60, y=0..80)
        const levelSize = { width: 100, height: 100 };
        const airWalls = [
            {
                points: [
                    [40, 0],
                    [60, 0],
                    [60, 80],
                    [40, 80],
                ] as [number, number][],
            },
        ];

        const pathfinder = new PathfindingService(levelSize, airWalls, 10);
        // Start at (10, 50), target at (80, 50)
        const path = pathfinder.findPath({ x: 10, y: 50 }, { x: 80, y: 50 });

        expect(path).not.toBeNull();
        expect(path!.length).toBeGreaterThan(2);

        // Verify that path bypasses the wall obstacle by going around y > 80
        const maxY = Math.max(...path!.map((p) => p.y));
        expect(maxY).toBeGreaterThanOrEqual(80);
    });

    it('detects line-of-sight correctly', () => {
        const levelSize = { width: 100, height: 100 };
        const airWalls = [
            {
                points: [
                    [40, 0],
                    [60, 0],
                    [60, 80],
                    [40, 80],
                ] as [number, number][],
            },
        ];
        const pathfinder = new PathfindingService(levelSize, airWalls, 10);

        // Path across wall is blocked
        expect(pathfinder.hasLineOfSight({ x: 10, y: 50 }, { x: 80, y: 50 })).toBe(false);
        // Clear path on same side of wall
        expect(pathfinder.hasLineOfSight({ x: 10, y: 10 }, { x: 20, y: 20 }, 0)).toBe(true);
    });
});

describe('monsters/logic — Crowd AI & Flocking', () => {
    type Stub = { dead: boolean; body: { position: { x: number; y: number } } };
    const mk = (x: number, y: number, dead = false): Stub => ({
        dead,
        body: { position: { x, y } },
    });

    it('calcSeparationForce generates repulsion vector between close monsters', () => {
        const m1 = mk(10, 10);
        const m2 = mk(14, 10);
        const force = calcSeparationForce(m1, [m1, m2], 30, 2.0);

        // m1 should be pushed to the left (negative x)
        expect(force.x).toBeLessThan(0);
        expect(force.y).toBeCloseTo(0);
    });

    it('calcSeparationForce ignores dead monsters', () => {
        const m1 = mk(10, 10);
        const deadAlly = mk(14, 10, true);
        const force = calcSeparationForce(m1, [m1, deadAlly], 30, 2.0);

        expect(force).toEqual({ x: 0, y: 0 });
    });

    it('getSurroundOffset calculates distributed ring angles', () => {
        const o0 = getSurroundOffset(0, 4, 20);
        const o2 = getSurroundOffset(2, 4, 20);

        expect(o0.x).toBeCloseTo(20);
        expect(o0.y).toBeCloseTo(0);
        expect(o2.x).toBeCloseTo(-20);
        expect(o2.y).toBeCloseTo(0);
    });

    it('getPathLookAheadPoint calculates smooth look-ahead target ahead along path', () => {
        const path = [
            { x: 0, y: 0 },
            { x: 0, y: 50 },
            { x: 50, y: 50 },
        ];
        const currentPos = { x: 0, y: 35 };
        const result = getPathLookAheadPoint(currentPos, path, 1, 30);

        // Should look ahead into second segment towards (50, 50)
        expect(result.target.x).toBeGreaterThan(0);
        expect(result.target.y).toBeCloseTo(50);
    });
});

describe('PathfindingService — pickEscapeDirection', () => {
    // Build a PathfindingService and reach into its private grid to
    // mark specific cells as walls. The escape-direction query reads
    // the grid directly so this is the cheapest way to set up corner /
    // corridor scenarios without rasterizing polygons.
    function mkGrid(
        width: number,
        height: number,
        block: (gx: number, gy: number) => boolean,
    ): PathfindingService {
        const pf = new PathfindingService({ width, height }, []);
        for (let gy = 0; gy < pf['gridHeight']; gy++) {
            for (let gx = 0; gx < pf['gridWidth']; gx++) {
                if (block(gx, gy)) pf['grid'][gy][gx] = 1;
            }
        }
        return pf;
    }

    it('picks a walkable neighbour on an empty grid (unit-length)', () => {
        const pf = new PathfindingService({ width: 64, height: 64 }, []);
        const dir = pf.pickEscapeDirection({ x: 32, y: 32 });
        expect(dir).not.toBeNull();
        expect(Math.hypot(dir!.x, dir!.y)).toBeCloseTo(1, 5);
    });

    it('avoids walls and walks into the open corridor', () => {
        // Monster at (80, 80) — cell (5, 5) on a 128x128 grid
        // (8x8 cells). Cell (5, 4) above is wall, (4, 5) left is wall.
        // Open neighbours: (6, 5) right, (5, 6) down, (6, 6) diag,
        // (4, 6) diag-left, (6, 4) diag-right, (4, 4) diag-up.
        // Without targetAway the function scores all equally; the
        // first one wins. Assert the result is a unit vector pointing
        // away from the wall (x >= 0, y >= 0).
        const pf = mkGrid(128, 128, (gx, gy) => {
            if (gy === 4 && gx === 5) return true; // wall above
            if (gx === 4 && gy === 5) return true; // wall left
            return false;
        });
        const dir = pf.pickEscapeDirection({ x: 80, y: 80 });
        expect(dir).not.toBeNull();
        expect(dir!.y).toBeGreaterThanOrEqual(0);
        expect(dir!.x).toBeGreaterThanOrEqual(0);
        expect(Math.hypot(dir!.x, dir!.y)).toBeCloseTo(1, 5);
    });

    it('prefers the direction opposite targetAway', () => {
        // Player is directly "above" the monster at the centre of a
        // 128x128 grid (cellSize=16 → 8x8 grid). Monster at (80, 80)
        // = cell (5, 5); player at (80, 48) — same column, above.
        // Escape direction should have a positive y component (down).
        const pf = new PathfindingService({ width: 128, height: 128 }, []);
        const dir = pf.pickEscapeDirection(
            { x: 80, y: 80 },
            { x: 80, y: 48 },
        );
        expect(dir).not.toBeNull();
        expect(dir!.y).toBeGreaterThan(0.3);
    });

    it('returns null when the monster is fully surrounded', () => {
        // 3x3 wall ring around cell (3, 3) on a 128x128 grid.
        // Even diagonals are blocked → no walkable neighbour → null.
        const pf = mkGrid(128, 128, (gx, gy) => {
            if (gx >= 2 && gx <= 4 && gy >= 2 && gy <= 4) {
                if (gx === 3 && gy === 3) return false; // monster cell
                return true;
            }
            return false;
        });
        const dir = pf.pickEscapeDirection({ x: 56, y: 56 });
        expect(dir).toBeNull();
    });
});

describe('PathfindingService — skipBufferZoneWaypoints', () => {
    function mkGrid(budget: (gx: number, gy: number) => number): PathfindingService {
        // Build a fresh PathfindingService whose grid we can mutate
        // before exercising the pure skip function.
        const pf = new PathfindingService({ width: 64, height: 64 }, []);
        for (let gy = 0; gy < pf['gridHeight']; gy++) {
            for (let gx = 0; gx < pf['gridWidth']; gx++) {
                pf['grid'][gy][gx] = budget(gx, gy);
            }
        }
        return pf;
    }

    it('returns the first waypoint outside the buffer zone', () => {
        // path = world points; the underlying grid marks cells (0,0)
        // and (1,0) as buffer zone (2). The third waypoint's cell is
        // walkable (0) — the function should return 2.
        const pf = mkGrid((gx, gy) => (gy === 0 && gx <= 1 ? 2 : 0));
        const path = [
            { x: 8, y: 8 }, // cell (0,0) — buffer
            { x: 24, y: 8 }, // cell (1,0) — buffer
            { x: 40, y: 8 }, // cell (2,0) — walkable
            { x: 56, y: 8 }, // cell (3,0) — walkable
        ];
        expect(pf.skipBufferZoneWaypoints(path, 0)).toBe(2);
    });

    it('returns startIdx when the leading waypoint is already walkable', () => {
        const pf = mkGrid(() => 0);
        const path = [
            { x: 8, y: 8 },
            { x: 24, y: 8 },
            { x: 40, y: 8 },
        ];
        expect(pf.skipBufferZoneWaypoints(path, 0)).toBe(0);
    });

    it('clamps to last waypoint when the entire tail is buffer', () => {
        const pf = mkGrid(() => 2);
        const path = [
            { x: 8, y: 8 },
            { x: 24, y: 8 },
            { x: 40, y: 8 },
        ];
        expect(pf.skipBufferZoneWaypoints(path, 0)).toBe(2);
    });

    it('handles empty / null-ish path', () => {
        const pf = mkGrid(() => 0);
        expect(pf.skipBufferZoneWaypoints([], 0)).toBe(0);
    });
});
