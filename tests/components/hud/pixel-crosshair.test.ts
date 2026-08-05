// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';

import { nativeToViewport } from '@/components/hud/pixel-crosshair';

describe('PixelCrosshair — nativeToViewport (native 1536x864 → viewport px)', () => {
    it('returns the canvas offset for coord 0 (top-left anchor)', () => {
        expect(nativeToViewport(0, 1536, 100, 800)).toBe(100);
        expect(nativeToViewport(0, 864, 200, 400)).toBe(200);
    });

    it('returns offset + canvasWidth for the far edge (1536/864)', () => {
        expect(nativeToViewport(1536, 1536, 0, 800)).toBe(800);
        expect(nativeToViewport(864, 864, 0, 400)).toBe(400);
    });

    it('interpolates linearly: midway on a 800px-wide canvas is at 400 + offset', () => {
        expect(nativeToViewport(768, 1536, 100, 800)).toBeCloseTo(500, 5);
    });

    it('returns -100 (off-screen) when the canvas has no size yet', () => {
        // Zero / negative canvasSize short-circuits — rect hasn't been
        // observed yet on first render, so don't render at garbage coords.
        expect(nativeToViewport(500, 1536, 100, 0)).toBe(-100);
    });
});
