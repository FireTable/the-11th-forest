import { describe, expect, it } from 'vitest';

import {
    chaseVelocity,
    decideAIState,
    dirTo,
    distBetween,
    pickClosestMonster,
    PathfindingService,
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
});