import { describe, it, expect } from 'vitest';
import { frameUniforms, type FrameFx } from '@/lib/boot-loading/gl';
import { BOOT_LOADING } from '@/lib/boot-loading/config';

const LAYERS = ['bg', 'chars', 'fg', 'title'] as const;

/** A mouse parked off-centre, so any ungated parallax would show up as a non-zero offset. */
const MOVED: FrameFx = { mx: 0.7, my: -0.4, done: 0 };

describe('frameUniforms', () => {
    it('moves nothing at all on the first frame', () => {
        const u = frameUniforms(MOVED, 0, 0, 1);
        expect(u.ke).toBe(0);
        expect(u.done).toBe(0);
        for (const name of LAYERS) {
            // -0 === 0, so this catches a signed zero as well as a real offset.
            expect(u.offsets[name].every((v) => v === 0)).toBe(true);
        }
    });

    it('moves nothing at k = 0 whatever t or the pointer are doing', () => {
        // The one that matters: the canvas may first draw at any t, and if any term survived
        // without the k ramp the handover from the static <img> would be a visible twitch.
        for (const t of [0, 0.017, 0.3, 1.7, Math.PI, 12.5]) {
            for (const fx of [
                { mx: 0, my: 0, done: 0 },
                { ...MOVED, done: 1 },
                { mx: -1, my: 1, done: 1 },
            ]) {
                const u = frameUniforms(fx, t, 0, 1);
                expect(u.ke).toBe(0);
                expect(u.done).toBe(0);
                for (const name of LAYERS) {
                    expect(u.offsets[name].every((v) => v === 0)).toBe(true);
                }
            }
        }
    });

    it('ramps the arch glow with k instead of popping it in', () => {
        const P = BOOT_LOADING;
        // Fully ramped, the glow sits at the idle tint…
        expect(frameUniforms(MOVED, 0, 1, 1).done).toBeCloseTo(P.ARCH_GLOW_IDLE, 10);
        // …rides up to the 100 % peak…
        expect(frameUniforms({ ...MOVED, done: 1 }, 0, 1, 1).done).toBeCloseTo(P.ARCH_GLOW, 10);
        // …and halfway through the ramp is halfway there (ke(0.5) = 0.5), not a step function.
        expect(frameUniforms({ ...MOVED, done: 1 }, 0, 0.5, 1).done).toBeCloseTo(
            P.ARCH_GLOW * 0.5,
            10,
        );
    });

    it('smoothsteps k exactly like the reveal does on the JS side', () => {
        for (const k of [0, 0.1, 0.25, 0.5, 0.75, 1]) {
            expect(frameUniforms(MOVED, 0, k, 1).ke).toBeCloseTo(k * k * (3 - 2 * k), 12);
        }
    });

    it('moves the title once the ramp is up, and nothing below it', () => {
        const P = BOOT_LOADING;
        const u = frameUniforms(MOVED, 0, 1, 1);
        expect(u.ke).toBe(1);
        expect(u.offsets.title[0]).toBeCloseTo(P.PARALLAX_TITLE * MOVED.mx, 10);
        // At t = 0 the breath curve is at its exhale end, so the float term is at full amplitude.
        expect(u.offsets.title[1]).toBeCloseTo(P.TITLE_FLOAT_PX + P.PARALLAX_TITLE * MOVED.my, 10);
        // The characters stay locked to their bg shadows — no parallax below the title.
        expect(u.offsets.bg).toEqual([0, 0]);
        expect(u.offsets.chars).toEqual([0, 0]);
        expect(u.offsets.fg).toEqual([0, 0]);
    });

    it('honours the phone effect scale on every amplitude', () => {
        const P = BOOT_LOADING;
        const soft = 0.6; // MOBILE_EFFECT_SCALE
        expect(frameUniforms(MOVED, 0, 1, soft).done).toBeCloseTo(P.ARCH_GLOW_IDLE * soft, 10);
        expect(frameUniforms(MOVED, 0, 1, soft).offsets.title[0]).toBeCloseTo(
            P.PARALLAX_TITLE * soft * MOVED.mx,
            10,
        );
    });
});
