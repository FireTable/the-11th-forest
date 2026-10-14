import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import {
    RUNNER_FRAMES,
    RUNNER_H,
    RUNNER_PALETTE,
    RUNNER_W,
    type PaletteKey,
} from '@/lib/boot-loading/runner';

/** RGBA scanlines (with the PNG filter byte) of frame 0, exactly as the canvas would draw it. */
function frameScanlines(): Buffer {
    const out: number[] = [];
    for (const row of RUNNER_FRAMES[0].rows) {
        out.push(0);
        for (const ch of row) {
            if (ch === '.') out.push(0, 0, 0, 0);
            else {
                const hex = RUNNER_PALETTE[ch as PaletteKey];
                out.push(
                    parseInt(hex.slice(1, 3), 16),
                    parseInt(hex.slice(3, 5), 16),
                    parseInt(hex.slice(5, 7), 16),
                    255,
                );
            }
        }
    }
    return Buffer.from(out);
}

describe('first-paint runner in index.html', () => {
    it('is frame 0 of the sprite, pixel for pixel, so the canvas takes over without a jump', () => {
        const html = readFileSync('index.html', 'utf8');
        const m = html.match(/url\('data:image\/png;base64,([A-Za-z0-9+/=]+)'\)/);
        expect(m, 'inline runner PNG missing from .pixel-runner').not.toBeNull();
        const png = Buffer.from(m![1], 'base64');
        expect(png.readUInt32BE(16)).toBe(RUNNER_W);
        expect(png.readUInt32BE(20)).toBe(RUNNER_H);
        const idatLen = png.readUInt32BE(33);
        const pixels = inflateSync(png.subarray(41, 41 + idatLen));
        // On a mismatch, re-export frame 0 as a 20×24 RGBA PNG and paste its data URI into the
        // .pixel-runner background in index.html.
        expect(pixels.toString('hex')).toBe(frameScanlines().toString('hex'));
    });
});
