import { describe, it, expect } from 'vitest';
import {
    ART_W,
    ART_H,
    LAYER_RECT,
    LOADING_ASSET_BASE,
    LOADING_ASSETS,
    coverFit,
    breath,
    breathGLSL,
    shouldAnimate,
    nextProgress,
    mapRealProgress,
    stageBox,
    capDpr,
    isLowEnd,
    effectScale,
    MOBILE_EFFECT_SCALE,
    smoothTowards,
    backingSize,
    shouldUseStaticFallback,
    textureUploadScale,
    fitTextureSize,
} from '@/lib/boot-loading/layout';
import { BOOT_LOADING } from '@/lib/constants';

describe('arch glow', () => {
    const [r, g, b] = BOOT_LOADING.ARCH_GLOW_COLOR;

    it('is warm yellow (#FFD966), not green, blue or purple', () => {
        expect([r, g, b]).toEqual([1, 0.85, 0.4]);
        // Warm = red is the strongest channel, and it is not green (g ≈ r) or blue/purple
        // (b would be ≥ g in either of those).
        expect(r).toBeGreaterThan(g);
        expect(g).toBeGreaterThan(b);
        expect(r - b).toBeGreaterThan(0.4);
    });

    it('stays subtle and only breathes gently', () => {
        expect(BOOT_LOADING.ARCH_GLOW).toBeGreaterThan(0);
        expect(BOOT_LOADING.ARCH_GLOW).toBeLessThanOrEqual(0.6);
        expect(BOOT_LOADING.ARCH_PULSE_AMT).toBeGreaterThan(0);
        expect(BOOT_LOADING.ARCH_PULSE_AMT).toBeLessThanOrEqual(0.35);
        expect(BOOT_LOADING.ARCH_PULSE_HZ).toBeLessThan(2);
    });

    it('is already lit while loading and brightens at 100 %', () => {
        // Visible during loading, but never as bright as the end.
        expect(BOOT_LOADING.ARCH_GLOW_IDLE).toBeGreaterThan(0.1);
        expect(BOOT_LOADING.ARCH_GLOW_IDLE).toBeLessThan(BOOT_LOADING.ARCH_GLOW);
        expect(BOOT_LOADING.ARCH_GLOW_MS).toBeGreaterThan(0);
    });

    it('glows around the arch, not the sky', () => {
        // The glow ellipse sits on the forest floor below the horizon line of the art.
        expect(BOOT_LOADING.ARCH_Y).toBeGreaterThan(400);
        expect(BOOT_LOADING.ARCH_RX).toBeGreaterThan(0);
        expect(BOOT_LOADING.ARCH_RY).toBeGreaterThan(0);
    });

    it('freezes the sky and keeps the ground alive', () => {
        // The sky gate is a depth-mask ramp: anything below SKY_GATE_LO reads as open sky and is
        // switched off, everything above SKY_GATE_HI (foliage and ground) sways at full strength.
        expect(BOOT_LOADING.SKY_GATE_LO).toBeGreaterThan(0);
        expect(BOOT_LOADING.SKY_GATE_HI).toBeGreaterThan(BOOT_LOADING.SKY_GATE_LO);
        expect(BOOT_LOADING.SKY_GATE_HI).toBeLessThan(1);
        expect(BOOT_LOADING.SWAY_PX).toBeGreaterThan(0);
        expect(BOOT_LOADING.MUSHROOM_GLOW).toBeGreaterThan(0);
    });

    it('has no sky effect left to configure', () => {
        const keys = Object.keys(BOOT_LOADING);
        expect(keys).not.toContain('AURORA_PX');
        expect(keys).not.toContain('AURORA_SHIMMER');
        expect(keys).not.toContain('STAR_TWINKLE');
        expect(keys).not.toContain('SHOOT_PERIOD_S');
        expect(keys).not.toContain('PARALLAX_BG');
    });
});

describe('guy belly swell', () => {
    it('swells hard enough to see, without taking his hands with it', () => {
        const { BELLY_SCALE, BELLY_MASK_LO, BELLY_MASK_HI } = BOOT_LOADING;
        expect(BELLY_SCALE).toBeGreaterThanOrEqual(0.1);
        expect(BELLY_SCALE).toBeLessThanOrEqual(0.16);
        // Measured on forest-loading-mask-chars.webp: his hands read 0.12–0.27 and the belly
        // itself 0.38–1.0. The gate has to start above the hands and reach full strength inside
        // the belly, or the arms get dragged outward with it.
        expect(BELLY_MASK_LO).toBeGreaterThanOrEqual(0.28);
        expect(BELLY_MASK_LO).toBeLessThanOrEqual(0.32);
        expect(BELLY_MASK_HI).toBeGreaterThan(BELLY_MASK_LO);
        expect(BELLY_MASK_HI).toBeLessThanOrEqual(0.8);
        // a real band, so the edge is feathered rather than stepped
        expect(BELLY_MASK_HI - BELLY_MASK_LO).toBeGreaterThan(0.2);
    });

    it('never lets the swell reach the hands', () => {
        // smoothstep(lo, hi, hand) — the shader's own formula, at the worst measured hand value
        const { BELLY_MASK_LO, BELLY_MASK_HI } = BOOT_LOADING;
        const at = (m: number): number => {
            const k = Math.min(
                1,
                Math.max(0, (m - BELLY_MASK_LO) / (BELLY_MASK_HI - BELLY_MASK_LO)),
            );
            return k * k * (3 - 2 * k);
        };
        expect(at(0.27)).toBe(0); // the outer hand
        expect(at(0.38)).toBeLessThan(0.15); // the belly's own rim only feathers in
        expect(at(1)).toBe(1); // the belly's core swells fully
    });
});

describe('coverFit', () => {
    it('is identity at the art resolution', () => {
        expect(coverFit(1920, 1072)).toEqual({ ox: 0, oy: 0, s: 1 });
    });

    it('centers when the viewport is narrower than the art', () => {
        const r = coverFit(960, 1072);
        expect(r.s).toBe(1);
        expect(r.ox).toBe(-480);
        expect(r.oy).toBe(0);
    });

    it('centers when the viewport is wider than the art', () => {
        const r = coverFit(3840, 1072);
        expect(r.s).toBe(2);
        expect(r.ox).toBe(0);
        expect(r.oy).toBe(-536);
    });
});

describe('breath', () => {
    it('starts at zero', () => {
        expect(breath(0, 2)).toBe(0);
    });

    it('peaks at the inhale/exhale handover', () => {
        expect(breath(0.4 * Math.PI, 2)).toBeCloseTo(1, 6);
    });

    it('returns to zero after one full period', () => {
        expect(breath(Math.PI, 2)).toBeCloseTo(0, 6);
    });

    it('stays within [0, 1]', () => {
        for (let i = 0; i < 200; i++) {
            const v = breath(i * 0.05, 2);
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThanOrEqual(1);
        }
    });
});

describe('breathGLSL', () => {
    it('emits the matching br() source', () => {
        const src = breathGLSL(2);
        expect(src.startsWith('float br(float t)')).toBe(true);
        expect(src).toContain('0.318310');
    });

    it('is the same curve the shader runs, over a whole breath period', () => {
        // Re-implements the emitted GLSL literally: fract(t*0.318310) and the rounded constants
        // 7.853982 (π/0.4) and 5.235988 (π/0.6) as they appear in breathGLSL's source.
        const glslBreath = (t: number): number => {
            const x = t * 0.31831 - Math.floor(t * 0.31831);
            return x < 0.4
                ? 0.5 - 0.5 * Math.cos(7.853982 * x)
                : 0.5 + 0.5 * Math.cos(5.235988 * (x - 0.4));
        };
        for (let i = 0; i < 50; i++) {
            const t = (i / 50) * 10;
            expect(breath(t, 2)).toBeCloseTo(glslBreath(t), 4);
        }
    });
});

describe('shouldAnimate', () => {
    it('is true only when enabled, WebGL-capable and motion allowed', () => {
        expect(shouldAnimate({ enabled: true, hasWebGL: true, reducedMotion: false })).toBe(true);
        expect(shouldAnimate({ enabled: false, hasWebGL: true, reducedMotion: false })).toBe(false);
        expect(shouldAnimate({ enabled: true, hasWebGL: false, reducedMotion: false })).toBe(false);
        expect(shouldAnimate({ enabled: true, hasWebGL: true, reducedMotion: true })).toBe(false);
    });
});

describe('nextProgress', () => {
    it('never goes backwards', () => {
        expect(nextProgress(0.5, 0.3)).toBe(0.5);
        expect(nextProgress(0.5, 0.7)).toBe(0.7);
    });

    it('clamps out-of-range and invalid input', () => {
        expect(nextProgress(0, 2)).toBe(1);
        expect(nextProgress(0, NaN)).toBe(0);
    });
});

describe('mapRealProgress', () => {
    it('continues from where the fake fill already is', () => {
        expect(mapRealProgress(0.5, 0)).toBeCloseTo(0.5, 10);
        expect(mapRealProgress(0.5, 0.5)).toBeCloseTo(0.735, 10);
        expect(mapRealProgress(0.5, 1)).toBeCloseTo(0.97, 10);
    });

    it('clamps the fake fill and the incoming value', () => {
        expect(mapRealProgress(1.2, 0.3)).toBeCloseTo(0.97, 10);
        expect(mapRealProgress(-0.4, 0.5)).toBeCloseTo(0.485, 10);
        expect(mapRealProgress(0, 2)).toBeCloseTo(0.97, 10);
        expect(mapRealProgress(0, NaN)).toBeCloseTo(0, 10);
    });

    it('never decreases as r grows', () => {
        let prev = -1;
        for (let i = 0; i <= 20; i++) {
            const v = mapRealProgress(0.31, i / 20);
            expect(v).toBeGreaterThanOrEqual(prev);
            prev = v;
        }
    });
});

describe('asset table', () => {
    it('exposes the art space dimensions', () => {
        expect(ART_W).toBe(1920);
        expect(ART_H).toBe(1072);
    });

    it('keeps every layer rect inside the art', () => {
        for (const rect of Object.values(LAYER_RECT)) {
            expect(rect.x + rect.w).toBeLessThanOrEqual(ART_W);
            expect(rect.y + rect.h).toBeLessThanOrEqual(ART_H);
            expect(rect.x).toBeGreaterThanOrEqual(0);
            expect(rect.y).toBeGreaterThanOrEqual(0);
        }
    });

    it('keeps the chars rect horizontally inside the art', () => {
        expect(LAYER_RECT.chars.x + LAYER_RECT.chars.w).toBeLessThanOrEqual(1920);
    });

    it('serves assets from the loading base path', () => {
        expect(LOADING_ASSET_BASE).toBe('/assets/image/ui/loading/');
        expect(LOADING_ASSETS.key).toBe('forest-loading-key.webp');
    });
});

/**
 * The coverage guarantee, checked on every viewport that matters: the placed art is at least as
 * big as the stage on both axes and never starts past an edge, so no side can be an empty band.
 *
 * This is plain `coverFit` — the same arithmetic the stylesheet's `object-fit: cover` does to
 * #boot-art, which is now the single source of truth for where the art lands. start.ts reads the
 * browser's layout rather than computing a fit of its own, so there is no second opinion to keep
 * in step with this one.
 */
describe('cover fit never letterboxes', () => {
    const onScreen = (fit: { ox: number; oy: number; s: number }, x: number, y: number) => ({
        x: fit.ox + x * fit.s,
        y: fit.oy + y * fit.s,
    });

    const checkNoGap = (viewW: number, viewH: number) => {
        const fit = coverFit(viewW, viewH);
        const w = ART_W * fit.s;
        const h = ART_H * fit.s;
        expect(fit.s).toBeCloseTo(Math.max(viewW / ART_W, viewH / ART_H), 9);
        expect(w).toBeGreaterThanOrEqual(viewW - 0.5);
        expect(h).toBeGreaterThanOrEqual(viewH - 0.5);
        expect(fit.ox).toBeLessThanOrEqual(0.5);
        expect(fit.oy).toBeLessThanOrEqual(0.5);
        expect(fit.ox + w).toBeGreaterThanOrEqual(viewW - 0.5);
        expect(fit.oy + h).toBeGreaterThanOrEqual(viewH - 0.5);
        // Never distorted: one uniform scale, so the x and y scales are identical.
        expect(w / ART_W).toBeCloseTo(h / ART_H, 9);
        return fit;
    };

    it.each([
        ['portrait phone', 390, 844],
        ['small portrait phone', 360, 640],
        ['landscape desktop', 1920, 1080],
        ['short landscape phone', 844, 390],
        ['ultrawide', 3440, 1440],
    ])('never letterboxes on a %s (%ix%i)', (_name, viewW, viewH) => {
        checkNoGap(viewW, viewH);
    });

    it('covers with no gap at every other viewport too', () => {
        for (const [w, h] of [
            [320, 480],
            [768, 1024],
            [1024, 768],
            [1440, 900],
            [2560, 1080],
            [1920, 1200],
            [500, 900],
            [900, 500],
            [1, 1],
        ]) {
            checkNoGap(w, h);
        }
    });

    it('still shows the title and the characters on a landscape desktop', () => {
        const fit = checkNoGap(1920, 1080);
        // Title (art 618,100 → 1306,369) and the character band (487,481 → 1457,976).
        for (const [x, y] of [
            [618, 100],
            [1306, 369],
            [487, 481],
            [1457, 976],
        ]) {
            const p = onScreen(fit, x, y);
            expect(p.x).toBeGreaterThanOrEqual(-0.5);
            expect(p.x).toBeLessThanOrEqual(1920 + 0.5);
            expect(p.y).toBeGreaterThanOrEqual(-0.5);
            expect(p.y).toBeLessThanOrEqual(1080 + 0.5);
        }
    });

    it('survives a degenerate viewport instead of producing NaN', () => {
        const fit = coverFit(0, 0);
        expect(Number.isFinite(fit.ox)).toBe(true);
        expect(Number.isFinite(fit.oy)).toBe(true);
        expect(Number.isFinite(fit.s)).toBe(true);
    });
});

describe('stageBox', () => {
    it('returns the padding box of the splash container', () => {
        expect(stageBox(390, 844, { top: 0, right: 0, bottom: 28, left: 0 })).toEqual({
            w: 390,
            h: 816,
        });
    });
});

describe('capDpr', () => {
    it('caps coarse pointers (mobile) at 2 even if the desktop cap is higher', () => {
        expect(capDpr(3, 4, true)).toBe(2);
    });

    it('uses the desktop cap on fine pointers', () => {
        expect(capDpr(3, 2, false)).toBe(2);
        expect(capDpr(3, 3, false)).toBe(3);
    });

    it('never upscales and survives a missing devicePixelRatio', () => {
        expect(capDpr(1.5, 2, true)).toBe(1.5);
        expect(capDpr(0, 2, false)).toBe(1);
        expect(capDpr(NaN, 2, false)).toBe(1);
    });
});

describe('isLowEnd', () => {
    it('flags weak cores or memory', () => {
        expect(isLowEnd({ hardwareConcurrency: 2, deviceMemory: 8 })).toBe(true);
        expect(isLowEnd({ hardwareConcurrency: 8, deviceMemory: 2 })).toBe(true);
        expect(isLowEnd({ hardwareConcurrency: 8, deviceMemory: undefined })).toBe(false);
        expect(isLowEnd({ hardwareConcurrency: 1, deviceMemory: 1 })).toBe(true);
    });
});

describe('effectScale', () => {
    it('runs full strength on a fine pointer', () => {
        expect(effectScale(false)).toBe(1);
    });

    it('softens every effect on a coarse pointer', () => {
        expect(effectScale(true)).toBe(MOBILE_EFFECT_SCALE);
        expect(effectScale(true)).toBeGreaterThan(0);
        expect(effectScale(true)).toBeLessThan(1);
    });
});

describe('smoothTowards', () => {
    it('does not move at dt 0', () => {
        expect(smoothTowards(0, 1, 0, 4)).toBe(0);
    });

    it('converges on the target over a long step', () => {
        expect(smoothTowards(0, 1, 10, 4)).toBeCloseTo(1, 5);
    });

    it('stays between the current value and the target on a normal frame', () => {
        const v = smoothTowards(0.2, -0.8, 0.016, 4);
        expect(v).toBeGreaterThan(-0.8);
        expect(v).toBeLessThan(0.2);
    });

    it('is frame-rate independent: two small steps match one big one', () => {
        const twoSmall = smoothTowards(smoothTowards(0, 1, 0.05, 4), 1, 0.05, 4);
        const oneBig = smoothTowards(0, 1, 0.1, 4);
        expect(twoSmall).toBeCloseTo(oneBig, 12);
    });
});

describe('shouldUseStaticFallback', () => {
    const base = {
        enabled: true,
        hasWebGL: true,
        reducedMotion: false,
        lowEnd: false,
    };

    it('animates only when everything is good', () => {
        expect(shouldUseStaticFallback(base)).toBe(false);
    });

    it('agrees with shouldAnimate on every gate it shares', () => {
        for (const o of [
            { ...base, enabled: false },
            { ...base, hasWebGL: false },
            { ...base, reducedMotion: true },
        ]) {
            const animate = shouldAnimate({
                enabled: o.enabled,
                hasWebGL: o.hasWebGL,
                reducedMotion: o.reducedMotion,
            });
            expect(shouldUseStaticFallback(o)).toBe(!animate);
        }
    });

    it('adds the low-end device fallback on top', () => {
        expect(shouldUseStaticFallback({ ...base, lowEnd: true })).toBe(true);
    });
});

describe('texture sizing', () => {
    it('pre-downscales only below the shimmer threshold', () => {
        expect(textureUploadScale(0.5)).toBe(0.5);
        expect(textureUploadScale(0.74)).toBe(0.74);
        expect(textureUploadScale(0.75)).toBe(1);
        expect(textureUploadScale(1.8)).toBe(1);
    });

    it('clamps a texture to MAX_TEXTURE_SIZE', () => {
        const r = fitTextureSize(1920, 1072, 1, 1024);
        expect(r.w).toBe(1024);
        expect(r.h).toBe(572);
        expect(r.scale).toBeCloseTo(1024 / 1920, 6);
    });

    it('keeps the requested scale when the limit allows it', () => {
        expect(fitTextureSize(970, 495, 0.5, 4096)).toEqual({ w: 485, h: 248, scale: 0.5 });
    });

    it('never allocates a zero-sized texture', () => {
        const r = fitTextureSize(100, 100, 0.001, 4096);
        expect(r.w).toBe(1);
        expect(r.h).toBe(1);
    });
});

// ─── loading-07: the first frame must land where the static <img> already is ──

/** Realistic stage (content-box) sizes: two phones, a rotated phone, three desktops. */
const L07_BOXES: Array<[number, number]> = [
    [320, 568],
    [390, 844],
    [844, 390],
    [1280, 720],
    [1366, 768],
    [1916, 1070],
    [2560, 1440],
];
/** 1.25 and 1.5 are the fractional ones (Android/iOS fractional DPR); 3 gets capped by MAX_DPR. */
const L07_DPRS = [1, 1.25, 1.5, 2, 3];
const L07_EPS = 1e-6;

describe('backingSize', () => {
    it('rounds the store to whole device pixels and reports the real per-axis scale', () => {
        // 390 × 1.25 = 487.5 — the fractional case a phone actually hits.
        const b = backingSize({ w: 390, h: 844 }, 1.25);
        expect(b.w).toBe(488);
        expect(b.sx).toBeCloseTo(488 / 390, 12);
        expect(b.h).toBe(1055);
        expect(b.sy).toBeCloseTo(1055 / 844, 12);
        // …and that is NOT the dpr: using the nominal dpr for uFit is the off-by-0.96-CSS-px bug.
        expect(b.sx).not.toBeCloseTo(1.25, 4);
    });

    it('stays within half a device pixel of the requested dpr on each axis', () => {
        for (const [w, h] of L07_BOXES) {
            for (const raw of L07_DPRS) {
                for (const coarsePointer of [false, true]) {
                    const dpr = capDpr(raw, BOOT_LOADING.MAX_DPR, coarsePointer);
                    const b = backingSize({ w, h }, dpr);
                    expect(Math.abs(b.sx - dpr) * w).toBeLessThanOrEqual(0.5 + L07_EPS);
                    expect(Math.abs(b.sy - dpr) * h).toBeLessThanOrEqual(0.5 + L07_EPS);
                }
            }
        }
    });

    it('never allocates a zero-sized backing store', () => {
        expect(backingSize({ w: 0, h: 0 }, 1)).toEqual({ w: 1, h: 1, sx: 1, sy: 1 });
    });
});

describe('static <img> vs the WebGL uFit', () => {
    /**
     * The two renderers, exactly as they work:
     *   - the stylesheet places #boot-art with `object-fit: cover`, so the image sits at
     *     coverFit(box) — CSS owns this and nothing in JS moves it;
     *   - start.ts MEASURES that same box, runs the same coverFit, and hands the result to uFit,
     *     scaled by the backing store's real sx/sy.
     *
     * uFit is in backing-store pixels and a backing pixel is 1/sx CSS px, so dividing uFit back
     * by the scale the store actually got has to land exactly on the image's rect. That is the
     * whole invariant: the factor that used to put the art ~1.9 device px out at a fractional
     * DPR is sx itself, and using the store's real sx instead of the nominal dpr cancels it.
     */
    const place = (w: number, h: number, rawDpr: number, coarsePointer: boolean) => {
        const dpr = capDpr(rawDpr, BOOT_LOADING.MAX_DPR, coarsePointer);
        const fit = coverFit(w, h); // what `object-fit: cover` does to the element box
        const { sx, sy } = backingSize({ w, h }, dpr);
        const ufit = [
            fit.ox * sx,
            fit.oy * sy,
            (fit.ox + ART_W * fit.s) * sx,
            (fit.oy + ART_H * fit.s) * sx, // uFit carries ONE scale — the art's height rides sx
        ];
        return {
            dpr,
            sx,
            sy,
            /** The <img>'s image rect, CSS px. */
            img: [fit.ox, fit.oy, fit.ox + ART_W * fit.s, fit.oy + ART_H * fit.s] as const,
            /** The canvas' art rect back in CSS px: uFit / (backing px per CSS px). */
            canvas: [ufit[0] / sx, ufit[1] / sy, ufit[2] / sx, ufit[3] / sx] as const,
        };
    };

    it('land on exactly the same rect on every viewport and DPR', () => {
        let checked = 0;
        for (const [w, h] of L07_BOXES) {
            for (const raw of L07_DPRS) {
                for (const coarsePointer of [false, true]) {
                    const { img, canvas } = place(w, h, raw, coarsePointer);
                    for (let i = 0; i < 4; i++) {
                        expect(canvas[i]).toBeCloseTo(img[i], 6);
                    }
                    checked++;
                }
            }
        }
        expect(checked).toBe(70);
    });

    it('the fractional-DPR cases really do quantise the store (otherwise the test is vacuous)', () => {
        // 390 x 1.25 = 487.5 device px, which no integer backing store can hold exactly.
        const { dpr, sx, sy } = place(390, 844, 1.25, false);
        expect(dpr).toBe(1.25);
        expect(backingSize({ w: 390, h: 844 }, 1.25).w).toBe(488);
        expect(Math.abs(sx - dpr)).toBeGreaterThan(1e-4); // 488/390 = 1.251282
        expect(sy).toBeCloseTo(dpr, 9); // 844 x 1.25 happens to be whole
    });

    it('still covers the stage on both axes, so no edge letterboxes', () => {
        for (const [w, h] of L07_BOXES) {
            for (const raw of L07_DPRS) {
                const { img, canvas } = place(w, h, raw, false);
                for (const edge of [img[0], img[1], canvas[0], canvas[1]]) {
                    expect(edge).toBeLessThanOrEqual(0.5);
                }
                for (const edge of [img[2], canvas[2]]) {
                    expect(edge).toBeGreaterThanOrEqual(w - 0.5);
                }
                for (const edge of [img[3], canvas[3]]) {
                    expect(edge).toBeGreaterThanOrEqual(h - 0.5);
                }
            }
        }
    });
});
