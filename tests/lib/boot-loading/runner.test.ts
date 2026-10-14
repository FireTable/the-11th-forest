import { describe, expect, it } from 'vitest';

import {
    RUNNER_FRAMES,
    RUNNER_H,
    RUNNER_PALETTE,
    RUNNER_STEPS_PER_BREATH,
    RUNNER_W,
    runnerFrameAt,
    runnerPixels,
    runnerStrideS,
    type PaletteKey,
} from '@/lib/boot-loading/runner';
import { BOOT_LOADING } from '@/lib/constants';

const CHARS = new Set<string>(['.', ...(Object.keys(RUNNER_PALETTE) as PaletteKey[])]);

/** Length of the run of `ch` that starts at the first `ch` in `row`. */
function runLength(row: string, ch: string): number {
    let n = 0;
    for (const c of row) {
        if (c !== ch) break;
        n++;
    }
    return n;
}

/** Width of the belly: the widest run of skin flanked by tank top on both sides. */
function bellyWidth(frame: (typeof RUNNER_FRAMES)[number]): number {
    let best = 0;
    for (const row of frame.rows) {
        for (let i = 1; i < row.length; i++) {
            if (row[i] !== 'S') continue;
            const n = runLength(row.slice(i), 'S');
            const tank = row[i - 1] === 'T' && row[i + n] === 'T';
            // Crop top: below the chest (row 13) the bare belly runs outline to outline.
            const crop = frame.rows.indexOf(row) > 13 && row[i - 1] === 'o';
            if (tank || crop) best = Math.max(best, n);
        }
    }
    return best;
}

describe('runner sprite data', () => {
    it('is four frames — two contacts and two passes', () => {
        expect(RUNNER_FRAMES).toHaveLength(4);
        expect(new Set(RUNNER_FRAMES.map((f) => f.rows.join('|'))).size).toBe(4);
    });

    it('is a 20×24 grid — every row exactly RUNNER_W characters', () => {
        expect(RUNNER_W).toBe(20);
        expect(RUNNER_H).toBe(24);
        for (const frame of RUNNER_FRAMES) {
            expect(frame.rows).toHaveLength(RUNNER_H);
            for (const row of frame.rows) expect(row).toHaveLength(RUNNER_W);
        }
    });

    it('uses only palette characters, never a colour outside the palette', () => {
        for (const frame of RUNNER_FRAMES) {
            for (const row of frame.rows) {
                for (const ch of row) expect(CHARS.has(ch)).toBe(true);
            }
        }
    });

    it('has a warm, dark, earthy palette — nothing neon', () => {
        for (const hex of Object.values(RUNNER_PALETTE)) {
            expect(hex).toMatch(/^#[0-9a-f]{6}$/);
        }
        // skin is warm (r > b), hair is dark brown (all channels low), shoes and top are white
        expect(channel(RUNNER_PALETTE.S, 'r')).toBeGreaterThan(channel(RUNNER_PALETTE.S, 'b'));
        expect(channel(RUNNER_PALETTE.H, 'r')).toBeGreaterThan(channel(RUNNER_PALETTE.H, 'b'));
        expect(channel(RUNNER_PALETTE.H, 'g')).toBeGreaterThan(channel(RUNNER_PALETTE.H, 'b'));
        expect(Math.max(...channelList(RUNNER_PALETTE.H))).toBeLessThan(0x80);
        expect(Math.min(...channelList(RUNNER_PALETTE.W))).toBeGreaterThan(0xe0);
        expect(Math.min(...channelList(RUNNER_PALETTE.T))).toBeGreaterThan(0xe0);
        expect(channel(RUNNER_PALETTE.G, 'r')).toBeLessThan(0x30);
        // army green cargo: green leads, blue trails
        expect(channel(RUNNER_PALETTE.C, 'g')).toBeGreaterThan(channel(RUNNER_PALETTE.C, 'b'));
        expect(channel(RUNNER_PALETTE.C, 'g')).toBeGreaterThan(channel(RUNNER_PALETTE.C, 'r'));
    });

    it('gives every material one tone variation plus a dark outline', () => {
        // shaded materials: the shade is strictly darker on every channel
        for (const [base, shade] of [
            ['S', 's'],
            ['T', 't'],
            ['C', 'c'],
            ['W', 'x'],
        ] as const) {
            for (const ch of ['r', 'g', 'b'] as const) {
                expect(channel(RUNNER_PALETTE[shade], ch)).toBeLessThan(
                    channel(RUNNER_PALETTE[base], ch),
                );
            }
        }
        // the hair's variation is a lit side, not a shade — but it is still dark brown
        expect(Math.max(...channelList(RUNNER_PALETTE.h))).toBeLessThan(0x80);
        expect(RUNNER_PALETTE.h).not.toBe(RUNNER_PALETTE.H);
        // the outline is darker than every material it is drawn around
        expect(Math.max(...channelList(RUNNER_PALETTE.o))).toBeLessThan(0x30);
    });

    it('paints hair, glasses, tank top, belly, cargo, pockets and sneakers in every frame', () => {
        const needed = [
            'o',
            'H',
            'h',
            'S',
            's',
            'G',
            'L',
            'T',
            't',
            'C',
            'c',
            'W',
            'x',
        ] as PaletteKey[];
        for (const frame of RUNNER_FRAMES) {
            const keys = new Set(runnerPixels(frame).map((p) => p.key));
            for (const key of needed) expect(keys.has(key)).toBe(true);
        }
    });

    it('gives him messy hair with spiky tips above a head that is over half the sprite', () => {
        const head = RUNNER_FRAMES[0].rows.join('\n');
        const hair = head.match(/H+/g) ?? [];
        expect(hair.length).toBeGreaterThanOrEqual(3);
        // the widest hair row spans at least 12 px — a big head on a short body
        expect(Math.max(...(head.match(/H+/g) ?? []).map((r) => r.length))).toBeGreaterThanOrEqual(
            12,
        );
        // spikes: a hair row whose top edge is separated into loose tips, not one solid line
        const tips = RUNNER_FRAMES[0].rows.findIndex((r) => /(^|\.)o\.o\.o/.test(r));
        expect(tips).toBeGreaterThan(-1);
        expect(tips).toBeLessThan(3);
        expect(hair[0]?.length ?? 0).toBeLessThan(RUNNER_W); // the spiky row is mostly gaps
    });

    it('draws two square glasses frames with a bridge, rimmed above and below', () => {
        const rows = RUNNER_FRAMES[0].rows;
        const lens = rows.findIndex((r) => r.includes('L'));
        expect(lens).toBeGreaterThan(-1);
        const row = rows[lens];
        // two lens runs of at least 3 px, split by a 2 px bridge
        expect(row).toMatch(/GLLLGG LLLG|GLLLGGLLLG/);
        const lensRuns = [...row.matchAll(/L+/g)].map((m) => m[0]);
        expect(lensRuns).toHaveLength(2);
        for (const run of lensRuns) expect(run.length).toBeGreaterThanOrEqual(3);
        // the rims above and below are solid black across both frames
        for (const r of [rows[lens - 1], rows[lens + 1]]) {
            expect(runLength(r.slice(r.indexOf('G')), 'G')).toBeGreaterThanOrEqual(8);
        }
    });

    it('crops the tank top above a bare belly, with a navel', () => {
        for (const frame of RUNNER_FRAMES) {
            // shoulders and chest are tank top
            expect(frame.rows[12]).toMatch(/oT{10}o/);
            expect(frame.rows[13]).toContain('TT');
            // the belly below is bare skin, no tank top pixel left on it
            for (const y of [14, 15, 16]) expect(frame.rows[y].slice(5, 15)).not.toContain('T');
            expect(bellyWidth(frame)).toBeGreaterThanOrEqual(8);
            // the navel: a dark pixel with skin either side, in the middle belly row
            expect(frame.rows[15]).toMatch(/SoS/);
        }
    });

    it('puts the cargo shorts with side pockets below the tank top, sneakers below those', () => {
        const rows = RUNNER_FRAMES[0].rows;
        const top = rows.findIndex((r) => r.includes('TT'));
        const shorts = rows.findIndex((r) => r.includes('CCCC'));
        const shoes = rows.findIndex((r) => r.includes('WWW'));
        expect(top).toBeGreaterThan(-1);
        expect(shorts).toBeGreaterThan(top);
        expect(shoes).toBeGreaterThan(shorts);
        // one shaded pocket at each hip
        expect(rows[shorts + 1]).toMatch(/oCc+C+cCo/);
        // the soles are the very bottom row, so the figure stands on the bar
        expect(rows[RUNNER_H - 1]).toContain('xxx');
    });

    it('carries the walk in the legs: the head never moves, every frame differs below it', () => {
        const [a, b, c, d] = RUNNER_FRAMES;
        const belly = 12; // everything above the tank top
        for (const other of [b, c, d]) {
            const head = a.rows.slice(0, belly);
            const differingHead = head.filter((row, i) => row !== other.rows[i]);
            expect(differingHead).toHaveLength(0);
        }
        // the legs themselves do differ, frame to frame
        const legs = a.rows.findIndex((r) => /oCCo/.test(r));
        expect(a.rows[legs]).not.toBe(b.rows[legs]);
        expect(c.rows[legs]).not.toBe(d.rows[legs]);
    });

    it('bobs the two pass frames up by exactly one pixel so the step reads as a stride', () => {
        expect(RUNNER_FRAMES.map((f) => f.bob)).toEqual([0, 1, 0, 1]);
        const ys = (f: (typeof RUNNER_FRAMES)[number]): number[] => runnerPixels(f).map((p) => p.y);
        expect(Math.min(...ys(RUNNER_FRAMES[1])) - Math.min(...ys(RUNNER_FRAMES[0]))).toBe(-1);
    });

    it('flattens to opaque pixels inside the grid, coloured from the palette', () => {
        for (const frame of RUNNER_FRAMES) {
            const px = runnerPixels(frame);
            expect(px.length).toBeGreaterThan(150);
            for (const p of px) {
                expect(p.color).toBe(RUNNER_PALETTE[p.key]);
                expect(p.x).toBeGreaterThanOrEqual(0);
                expect(p.x).toBeLessThan(RUNNER_W);
                expect(p.y).toBeGreaterThanOrEqual(0);
                expect(p.y).toBeLessThan(RUNNER_H);
            }
        }
    });
});

describe('runnerFrameAt', () => {
    const w = BOOT_LOADING.BREATH_W;
    const period = (2 * Math.PI) / w; // one breath, the same period breath() uses

    it('only ever returns one of the four frames', () => {
        for (let i = 0; i < 400; i++) expect([0, 1, 2, 3]).toContain(runnerFrameAt(i * 0.05, w));
    });

    it('runs on the breath period, stepping four evenly spaced times per breath', () => {
        expect(runnerStrideS(w) * RUNNER_STEPS_PER_BREATH).toBeCloseTo(period, 9);
        const flips: number[] = [];
        const steps = 2000;
        for (let i = 1; i <= steps; i++) {
            const t = (i / steps) * period;
            if (runnerFrameAt(t - 1e-4, w) !== runnerFrameAt(t, w)) flips.push(t / period);
        }
        expect(flips).toHaveLength(RUNNER_STEPS_PER_BREATH);
        flips.forEach((at, i) => expect(at).toBeCloseTo((i + 1) / RUNNER_STEPS_PER_BREATH, 2));
    });

    it('visits every frame once per breath', () => {
        const seen = new Set<number>();
        const steps = 400;
        for (let i = 0; i < steps; i++) seen.add(runnerFrameAt((i / steps) * period, w));
        expect([...seen].sort()).toEqual([0, 1, 2, 3]);
    });

    it('steps at a walkable cadence — a step every breath quarter to half a second', () => {
        const step = runnerStrideS(w);
        expect(step).toBeGreaterThan(0.25);
        expect(step).toBeLessThan(1.2);
    });
});

function channel(h: string, ch: 'r' | 'g' | 'b'): number {
    const n = parseInt(h.slice(1), 16);
    if (ch === 'r') return (n >> 16) & 0xff;
    if (ch === 'g') return (n >> 8) & 0xff;
    return n & 0xff;
}

function channelList(h: string): number[] {
    return [channel(h, 'r'), channel(h, 'g'), channel(h, 'b')];
}
