import { describe, it, expect } from 'vitest';

import { isMeaningfulPolygon, polygonBounds, rectToPoints } from '@/lib/editor/polygon';

describe('rectToPoints', () => {
    it('returns the four corners in clockwise order starting from top-left', () => {
        expect(rectToPoints(10, 20, 30, 40)).toEqual([
            { x: 10, y: 20 },
            { x: 40, y: 20 },
            { x: 40, y: 60 },
            { x: 10, y: 60 },
        ]);
    });

    it('handles zero-size rect', () => {
        expect(rectToPoints(0, 0, 0, 0)).toEqual([
            { x: 0, y: 0 },
            { x: 0, y: 0 },
            { x: 0, y: 0 },
            { x: 0, y: 0 },
        ]);
    });
});

describe('polygonBounds', () => {
    it('returns null for empty list', () => {
        expect(polygonBounds([])).toBeNull();
    });

    it('wraps a single point', () => {
        expect(polygonBounds([{ x: 5, y: 7 }])).toEqual({
            x: 5,
            y: 7,
            width: 0,
            height: 0,
        });
    });

    it('computes the axis-aligned bounding box', () => {
        const pts = [
            { x: 10, y: 30 },
            { x: 50, y: 10 },
            { x: 80, y: 40 },
            { x: 20, y: 60 },
        ];
        expect(polygonBounds(pts)).toEqual({
            x: 10,
            y: 10,
            width: 70,
            height: 50,
        });
    });
});

describe('isMeaningfulPolygon', () => {
    it('rejects polygons with fewer than 3 vertices', () => {
        expect(isMeaningfulPolygon([])).toBe(false);
        expect(isMeaningfulPolygon([{ x: 0, y: 0 }])).toBe(false);
        expect(
            isMeaningfulPolygon([
                { x: 0, y: 0 },
                { x: 10, y: 0 },
            ]),
        ).toBe(false);
    });

    it('rejects polygons smaller than the default 8px threshold', () => {
        // 3 collinear points spanning 4×4
        expect(
            isMeaningfulPolygon([
                { x: 0, y: 0 },
                { x: 4, y: 0 },
                { x: 4, y: 4 },
            ]),
        ).toBe(false);
    });

    it('accepts a triangle that fits the threshold', () => {
        expect(
            isMeaningfulPolygon([
                { x: 0, y: 0 },
                { x: 20, y: 0 },
                { x: 10, y: 20 },
            ]),
        ).toBe(true);
    });

    it('respects a custom minimum', () => {
        const tiny = [
            { x: 0, y: 0 },
            { x: 4, y: 0 },
            { x: 4, y: 4 },
        ];
        expect(isMeaningfulPolygon(tiny, 2)).toBe(true);
        expect(isMeaningfulPolygon(tiny, 100)).toBe(false);
    });
});
