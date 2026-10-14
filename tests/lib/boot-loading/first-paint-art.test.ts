import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { coverFit, stageFit, FOCAL_POINT, ART_W } from '@/lib/boot-loading/layout';

/**
 * The static #boot-art is laid out TWICE: once by the stylesheet (a centred `object-fit: cover`)
 * and once by placeArt() (a cover fitted around FOCAL_POINT). Those are different rects, so
 * painting the first one costs a visible sideways jump. The image is therefore kept
 * `visibility: hidden` until placeArt() has placed it — both assertions below exist to stop that
 * gate being quietly removed.
 */
describe('static art first paint', () => {
    it('is hidden in the stylesheet until placeArt() has placed it', () => {
        const html = readFileSync('index.html', 'utf8');
        // Non-greedy up to a closing brace at the rule's own indentation: a plain `[^}]*` stops
        // dead at the `{ max-width: 100% }` inside the neighbouring comment.
        const rule = html.match(/#boot\s+\.forest-bg\s*\{([\s\S]*?)\n\s{12}\}/);
        expect(rule, '.forest-bg rule missing from index.html').not.toBeNull();
        expect(rule![1]).toMatch(/visibility:\s*hidden/);
    });

    it('the stylesheet rect and the fitted rect genuinely disagree', () => {
        // A 1280x800 stage, which is where this was caught.
        const w = 1280;
        const h = 800;
        const centred = coverFit(w, h); // what `object-fit: cover; object-position: 50% 50%` does
        const fitted = stageFit(w, h); // what placeArt() writes
        // The focal point sits this far right of the geometric centre, and the crop is this wide,
        // so the two fits disagree by (offset x overflow-fraction).
        expect(FOCAL_POINT.x - ART_W / 2).toBeGreaterThan(0);
        const gap = Math.abs(centred.ox - fitted.ox);
        expect(gap).toBeGreaterThan(5); // ~9 CSS px here — a clearly visible twitch
        // And it is a horizontal shift, not a scale or vertical one.
        expect(Math.abs(centred.s - fitted.s)).toBeLessThan(1e-9);
        expect(Math.abs(centred.oy - fitted.oy)).toBeLessThan(1e-9);
    });

    it('so the gate is load-bearing: matching the CSS to the fit would make it dead code', () => {
        // If someone ever sets FOCAL_POINT to the exact centre, the stylesheet and placeArt()
        // agree, the gate is no longer needed, and this is the reminder to remove it.
        const gap = Math.abs(coverFit(1280, 800).ox - stageFit(1280, 800).ox);
        expect(FOCAL_POINT.x).not.toBe(ART_W / 2);
        expect(gap).toBeGreaterThan(0);
    });
});
