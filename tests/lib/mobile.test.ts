// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { isMobileLike, isPortraitViewport } from '@/lib/mobile';

describe('lib/mobile — viewport detection', () => {
    const originalInnerWidth = window.innerWidth;
    const originalInnerHeight = window.innerHeight;

    beforeEach(() => {
        // stub.matchMedia for isMobileLike()
        vi.stubGlobal(
            'matchMedia',
            vi.fn().mockImplementation((q: string) => ({
                matches: q === '(pointer: coarse)',
                media: q,
                addEventListener: () => {},
                removeEventListener: () => {},
            })),
        );
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        Object.defineProperty(window, 'innerWidth', {
            value: originalInnerWidth,
            configurable: true,
        });
        Object.defineProperty(window, 'innerHeight', {
            value: originalInnerHeight,
            configurable: true,
        });
    });

    function setViewport(w: number, h: number): void {
        Object.defineProperty(window, 'innerWidth', { value: w, configurable: true });
        Object.defineProperty(window, 'innerHeight', { value: h, configurable: true });
    }

    it('isPortraitViewport: true when height > width', () => {
        setViewport(375, 812);
        expect(isPortraitViewport()).toBe(true);
    });

    it('isPortraitViewport: false when width > height', () => {
        setViewport(812, 375);
        expect(isPortraitViewport()).toBe(false);
    });

    it('isMobileLike: true on narrow + coarse pointer', () => {
        setViewport(375, 812);
        expect(isMobileLike()).toBe(true);
    });

    it('isMobileLike: false on wide desktop', () => {
        setViewport(1920, 1080);
        expect(isMobileLike()).toBe(false);
    });
});
