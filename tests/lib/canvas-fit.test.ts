import { describe, expect, it } from 'vitest';

import { fitZoom } from '@/lib/canvas-fit';

describe('lib/canvas-fit — fitZoom', () => {
    it('picks the smaller ratio so 100% of the game map is visible inside the container', () => {
        expect(fitZoom(844, 390, 1536, 864)).toBeCloseTo(390 / 864, 5);
        expect(fitZoom(900, 600, 1536, 864)).toBeCloseTo(900 / 1536, 5);
    });

    it('is 1 for an exact match', () => {
        expect(fitZoom(1536, 864, 1536, 864)).toBe(1);
    });

    it('falls back to 1 on a zero-sized box (pre-layout)', () => {
        expect(fitZoom(0, 0, 1536, 864)).toBe(1);
    });
});
