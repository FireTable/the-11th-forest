import { describe, expect, it } from 'vitest';

import { coverZoom } from '@/game/scale/canvas-fit';

describe('game/scale — coverZoom', () => {
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
