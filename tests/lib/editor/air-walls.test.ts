import { describe, it, expect } from 'vitest';

import type { Level } from '@/lib/levels/types';

import {
    addWall,
    moveWall,
    nextWallId,
    removeWall,
    resizeWall,
    setWallKind,
} from '@/lib/editor/air-walls';

const base: Level = {
    title: 't',
    background: 'b',
    imageSize: { width: 100, height: 100 },
    promptFile: 'p',
    airWalls: [],
};

describe('nextWallId', () => {
    it('starts at wall-1 for an empty list', () => {
        expect(nextWallId([])).toBe('wall-1');
    });

    it('increments past the highest existing numeric suffix', () => {
        const walls = [
            { id: 'wall-1', kind: 'tall' as const, x: 0, y: 0, width: 1, height: 1 },
            { id: 'wall-3', kind: 'short' as const, x: 0, y: 0, width: 1, height: 1 },
        ];
        expect(nextWallId(walls)).toBe('wall-4');
    });

    it('ignores non-numeric ids when picking the suffix', () => {
        const walls = [
            { id: 'custom-7', kind: 'tall' as const, x: 0, y: 0, width: 1, height: 1 },
        ];
        expect(nextWallId(walls)).toBe('wall-1');
    });
});

describe('addWall', () => {
    it('appends a wall with auto id', () => {
        const out = addWall(base, 'tall', 10, 20, 30, 40);
        expect(out.airWalls).toHaveLength(1);
        expect(out.airWalls[0]).toEqual({
            id: 'wall-1',
            kind: 'tall',
            x: 10,
            y: 20,
            width: 30,
            height: 40,
        });
    });

    it('does not mutate the input level', () => {
        addWall(base, 'tall', 0, 0, 1, 1);
        expect(base.airWalls).toEqual([]);
    });
});

describe('removeWall', () => {
    it('drops the wall with the matching id', () => {
        const seeded = addWall(addWall(base, 'tall', 0, 0, 1, 1), 'short', 0, 0, 1, 1);
        const out = removeWall(seeded, 'wall-1');
        expect(out.airWalls).toHaveLength(1);
        expect(out.airWalls[0].id).toBe('wall-2');
    });

    it('returns equivalent content when id not found', () => {
        const out = removeWall(base, 'wall-99');
        expect(out.airWalls).toEqual([]);
    });
});

describe('moveWall', () => {
    it('updates x/y of the matching wall only', () => {
        const a = addWall(base, 'tall', 10, 20, 30, 40);
        const seeded = addWall(a, 'short', 50, 60, 5, 5);
        const out = moveWall(seeded, 'wall-1', 100, 200);
        expect(out.airWalls[0]).toEqual({
            id: 'wall-1',
            kind: 'tall',
            x: 100,
            y: 200,
            width: 30,
            height: 40,
        });
        expect(out.airWalls[1].x).toBe(50);
    });
});

describe('resizeWall', () => {
    it('updates width/height of the matching wall only', () => {
        const a = addWall(base, 'tall', 10, 20, 30, 40);
        const seeded = addWall(a, 'short', 50, 60, 5, 5);
        const out = resizeWall(seeded, 'wall-1', 100, 200);
        expect(out.airWalls[0]).toEqual({
            id: 'wall-1',
            kind: 'tall',
            x: 10,
            y: 20,
            width: 100,
            height: 200,
        });
        expect(out.airWalls[1].width).toBe(5);
    });
});

describe('setWallKind', () => {
    it('updates kind of the matching wall only', () => {
        const a = addWall(base, 'tall', 10, 20, 30, 40);
        const seeded = addWall(a, 'short', 50, 60, 5, 5);
        const out = setWallKind(seeded, 'wall-1', 'short');
        expect(out.airWalls[0].kind).toBe('short');
        expect(out.airWalls[0].x).toBe(10);
        expect(out.airWalls[1].kind).toBe('short');
    });
});