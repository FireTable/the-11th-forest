import { describe, expect, it } from 'vitest';

import { coverZoom, fitZoom } from '@/lib/canvas-fit';

describe('lib/canvas-fit — coverZoom', () => {
    it('picks the larger ratio so the game covers the box', () => {
        // 844x390 landscape phone vs a 1536x864 game: height ratio 0.451,
        // width ratio 0.549 → cover uses the width one and crops height.
        expect(coverZoom(844, 390, 1536, 864)).toBeCloseTo(844 / 1536, 5);
        // Taller box → height ratio drives instead.
        expect(coverZoom(900, 600, 1536, 864)).toBeCloseTo(600 / 864, 5);
    });

    it('is 1 for an exact match', () => {
        expect(coverZoom(1536, 864, 1536, 864)).toBe(1);
    });

    it('falls back to 1 on a zero-sized box (pre-layout)', () => {
        expect(coverZoom(0, 0, 1536, 864)).toBe(1);
    });

    it('caps overscan so a freak window shape letterboxes instead', () => {
        // 1920x600 would need 2.2x the fit zoom to cover — clamp at 1.35.
        const fit = Math.min(1920 / 1536, 600 / 864);
        expect(coverZoom(1920, 600, 1536, 864)).toBeCloseTo(fit * 1.35, 5);
    });
});

describe('lib/canvas-fit — fitZoom', () => {
    it('picks the smaller ratio so 100% of the game map is visible inside the container', () => {
        expect(fitZoom(844, 390, 1536, 864)).toBeCloseTo(390 / 864, 5);
        expect(fitZoom(900, 600, 1536, 864)).toBeCloseTo(900 / 1536, 5);
    });
});
