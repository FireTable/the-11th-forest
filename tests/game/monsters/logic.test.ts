import { describe, expect, it } from 'vitest';

import {
    chaseVelocity,
    decideAIState,
    dirTo,
    distBetween,
    isWaypointReached,
    pickClosestMonster,
    PathfindingService,
    calcSeparationForce,
    getSurroundOffset,
    getPathLookAheadPoint,
} from '@/game/monsters/logic';

describe('monsters/logic — decideAIState', () => {
    it('switches from chase to attack only after crossing range minus hysteresis', () => {
        // Just inside range → still chase (not enough margin to flip)
        expect(decideAIState(34, 36, 'chase')).toBe('chase');
        // Clearly inside (≤ range - hysteresis default 8)
        expect(decideAIState(28, 36, 'chase')).toBe('attack');
        expect(decideAIState(0, 36, 'chase')).toBe('attack');
    });

    it('switches from attack to chase only after crossing range plus hysteresis', () => {
        // Just outside range → still attack (hysteresis hold)
        expect(decideAIState(38, 36, 'attack')).toBe('attack');
        // Clearly outside (> range + hysteresis default 8)
        expect(decideAIState(45, 36, 'attack')).toBe('chase');
    });

    it('does not strobe when distance jitters around the threshold', () => {
        // Player at dist oscillating 35 / 36 / 37 / 36 — none of these
        // flip the state once it has settled into one of them.
        expect(decideAIState(35, 36, 'attack')).toBe('attack');
        expect(decideAIState(36, 36, 'attack')).toBe('attack');
        expect(decideAIState(37, 36, 'attack')).toBe('attack');
        expect(decideAIState(34, 36, 'chase')).toBe('chase');
        expect(decideAIState(33, 36, 'chase')).toBe('chase');
    });

    it('respects a custom hysteresis band', () => {
        // With band = 16, a 4-px buffer past range still holds chase
        expect(decideAIState(40, 36, 'chase', 16)).toBe('chase');
        // And only distance ≤ 20 (= 36 - 16) triggers attack
        expect(decideAIState(20, 36, 'chase', 16)).toBe('attack');
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

    it('routes around the 1-cell buffer so the path never enters buffer cells', () => {
        // Wall on the right at x=70..90, open field on the left.
        // The buffer cell (5, 2) sits at x=50..60 (cellSize=10). Any
        // cell whose neighbour is buffer or wall must NOT appear in
        // the returned path.
        const levelSize = { width: 100, height: 100 };
        const airWalls = [
            {
                points: [
                    [70, 0],
                    [90, 0],
                    [90, 40],
                    [70, 40],
                ] as [number, number][],
            },
        ];
        const pathfinder = new PathfindingService(levelSize, airWalls, 10);
        // Target sits inside the buffer cell — the path should still
        // succeed via snapToWalkable and the buffer-aware A*.
        const path = pathfinder.findPath(
            { x: 10, y: 20 },
            { x: 60, y: 20 },
            10,
            10,
        );
        expect(path).not.toBeNull();
        // Path waypoints must never land on buffer or wall cells.
        for (const wp of path!) {
            const gx = Math.floor(wp.x / 10);
            const gy = Math.floor(wp.y / 10);
            expect(gx).toBeGreaterThanOrEqual(0);
            expect(gx).toBeLessThan(10);
            const cell = (pathfinder as unknown as { grid: number[][] }).grid[gy]?.[gx];
            // 0 = walkable, 1 = wall, 2 = buffer
            expect(cell).toBe(0);
        }
    });

    it('advances past waypoints that sit inside the body box', () => {
        // Open level, start near the monster so the first A* waypoint
        // would land within halfH of the start point. The path should
        // either skip past it or report it ≥ halfH away from the start.
        const pathfinder = new PathfindingService(
            { width: 100, height: 100 },
            [],
            10,
        );
        const path = pathfinder.findPath(
            { x: 50, y: 50 },
            { x: 90, y: 50 },
            10,
            10,
        );
        expect(path).not.toBeNull();
        // First waypoint after start should be at least halfH away
        // (the filter drops anything sitting inside the body box).
        if (path!.length > 1) {
            const first = path![1];
            const d = Math.hypot(first.x - 50, first.y - 50);
            expect(d).toBeGreaterThanOrEqual(10 - 1);
        }
    });
});

describe('monsters/logic — isWaypointReached', () => {
    it('returns true when distance is within bodyHalf + breathing-room', () => {
        // 10 ≤ 10 + 1 → reached
        expect(isWaypointReached(10, 10, 1)).toBe(true);
        // 12 > 10 + 1 → not reached
        expect(isWaypointReached(12, 10, 1)).toBe(false);
    });

    it('returns false for far waypoints', () => {
        expect(isWaypointReached(80, 10, 1)).toBe(false);
    });

    it('treats flushOffset as additive padding', () => {
        // dist 12, half 10, offset 1 → 12 ≤ 11 = false
        expect(isWaypointReached(12, 10, 1)).toBe(false);
        // dist 12, half 10, offset 2 → 12 ≤ 12 = true
        expect(isWaypointReached(12, 10, 2)).toBe(true);
    });
});

describe('PathfindingService — isPositionInCorner', () => {
    it('returns false on a fully open grid', () => {
        const pf = new PathfindingService({ width: 64, height: 64 }, []);
        expect(pf.isPositionInCorner({ x: 32, y: 32 })).toBe(false);
    });

    it('returns true when the cell has a wall neighbour', () => {
        // 32x32 grid, cellSize=16 → 2x2 grid. Mark cell (1, 0) as
        // wall — position (24, 8) sits in cell (1, 1) which is next
        // to the wall, so the function reports corner.
        const pf = new PathfindingService({ width: 32, height: 32 }, []);
        for (let gy = 0; gy < pf['gridHeight']; gy++) {
            for (let gx = 0; gx < pf['gridWidth']; gx++) {
                if (gx === 1 && gy === 0) pf['grid'][gy][gx] = 1;
            }
        }
        expect(pf.isPositionInCorner({ x: 24, y: 24 })).toBe(true);
    });

    it('returns true when the cell has a buffer neighbour', () => {
        const pf = new PathfindingService({ width: 32, height: 32 }, []);
        // Mark cell (0, 0) as wall — cell (1, 1) gets buffer in
        // rasterization, but here we just stamp the buffer directly.
        for (let gy = 0; gy < pf['gridHeight']; gy++) {
            for (let gx = 0; gx < pf['gridWidth']; gx++) {
                if (gx === 0 && gy === 0) pf['grid'][gy][gx] = 1;
            }
        }
        // Manually mark cell (1, 1) as buffer to simulate the post-
        // rasterize state.
        pf['grid'][1][1] = 2;
        // Position (24, 24) sits in cell (1, 1) — neighbour (0, 1)
        // is 0 but neighbour (0, 0) is wall via Chebyshev. Even if we
        // cleared that, a 2-neighbour should still trigger.
        expect(pf.isPositionInCorner({ x: 24, y: 24 })).toBe(true);
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

// skipBufferZoneWaypoints was collapsed to a clamp in the pathfinding
// simplification pass — the buffer zone no longer drives waypoint
// skipping because flush alignment handles it directly. The clamp
// behaviour is exercised by every findPath test that consumes the
// return value.

describe('PathfindingService — steerAroundWall', () => {
    // ponytail: removed — per-frame wall steering broke melee
    // monsters that intentionally hug walls. Kept the describe block
    // as a placeholder so future helpers can land here.
});
