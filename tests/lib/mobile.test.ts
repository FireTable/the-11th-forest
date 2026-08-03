// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import {
    appViewport,
    isMobileLike,
    isPortraitViewport,
    isRotated,
    toAppPoint,
    toAppRect,
} from '@/lib/mobile';

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

    it('isRotated: true only on a portrait touch viewport', () => {
        setViewport(375, 812);
        expect(isRotated()).toBe(true);
        setViewport(812, 375);
        expect(isRotated()).toBe(false);
    });

    it('appViewport: swaps width/height while rotated', () => {
        setViewport(375, 812);
        expect(appViewport()).toEqual({ width: 812, height: 375 });
        setViewport(812, 375);
        expect(appViewport()).toEqual({ width: 812, height: 375 });
    });

    it('toAppPoint: maps client coords into the rotated app space', () => {
        setViewport(400, 800);
        // App origin (0,0) is the viewport's top-right corner.
        expect(toAppPoint(400, 0)).toEqual({ x: 0, y: 0 });
        // App +x runs down the screen, +y runs right-to-left.
        expect(toAppPoint(400, 800)).toEqual({ x: 800, y: 0 });
        expect(toAppPoint(0, 0)).toEqual({ x: 0, y: 400 });
    });

    it('toAppPoint: identity when not rotated', () => {
        setViewport(800, 400);
        expect(toAppPoint(120, 30)).toEqual({ x: 120, y: 30 });
    });

    it('toAppRect: un-rotates a client rect (w/h swap, origin shift)', () => {
        setViewport(400, 800);
        expect(toAppRect({ left: 100, top: 40, width: 200, height: 600 })).toEqual({
            left: 40,
            top: 100,
            width: 600,
            height: 200,
        });
    });

    it('toAppRect: identity when not rotated', () => {
        setViewport(800, 400);
        const r = { left: 100, top: 40, width: 200, height: 60 };
        expect(toAppRect(r)).toEqual(r);
    });
});
