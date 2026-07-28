/**
 * Split an AI-generated sprite sheet with a magenta chroma-key background
 * into individual transparent PNG frames.
 *
 * Usage: pnpm tsx scripts/split-sheet.ts <sheet.png> <outDir> [--pad=2]
 *        pnpm tsx scripts/split-sheet.ts --recompose <outDir> <orig.png> --rows=N --cols=M [<out.png>]
 *
 * The sheet does not need an even grid: frames are found by scanning for
 * fully-transparent bands (rows first, then columns within each row).
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { PNG } from 'pngjs';

/**
 * Edge anti-halo: for low-alpha pixels, check the *underlying* RGB.
 * If the color is still magenta, drop it fully; otherwise it is
 * genuine edge anti-aliasing on the sprite, so let it through.
 *
 * Without this, every sprite ends up with a faint purple fringe
 * because PNG chroma-key tolerance is a single threshold and
 * real edges straddle it. The check only touches low-alpha pixels;
 * fully-opaque sprite colors are never inspected.
 */
function stripEdgeHalo(png: PNG): void {
    const { data } = png;
    for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3];
        if (a === 0 || a === 255) continue;
        if (isMagentaLeaning(data[i], data[i + 1], data[i + 2])) data[i + 3] = 0;
    }
}

/**
 * 4-connected flood-fill from a seed. Iterative (stack, not recursion)
 * so a 2048×2048 magenta field never blows the call stack.
 * `accept` is the "matches?" predicate; pixels where it returns false
 * are skipped and don't propagate to neighbors.
 */
function floodFill(
    png: PNG,
    seedX: number,
    seedY: number,
    accept: (x: number, y: number) => boolean,
): void {
    const { width: w, height: h } = png;
    const visited = new Uint8Array(w * h);
    const stack: number[] = [seedY * w + seedX];
    while (stack.length) {
        const idx = stack.pop()!;
        if (visited[idx]) continue;
        visited[idx] = 1;
        const x = idx % w;
        const y = (idx - x) / w;
        if (!accept(x, y)) continue;
        if (x > 0) stack.push(idx - 1);
        if (x < w - 1) stack.push(idx + 1);
        if (y > 0) stack.push(idx - w);
        if (y < h - 1) stack.push(idx + w);
    }
}

/** Find a magenta corner pixel to use as the flood-fill seed. */
function findKeySeed(png: PNG): { x: number; y: number } | null {
    const { width, height, data } = png;
    const corners = [
        [0, 0],
        [width - 1, 0],
        [0, height - 1],
        [width - 1, height - 1],
    ] as const;
    for (const [x, y] of corners) {
        const i = (width * y + x) << 2;
        if (isMagentaLeaning(data[i], data[i + 1], data[i + 2])) return { x, y };
    }
    return null;
}

/**
 * Edge pixels (silhouette boundary) sit between the chroma background
 * and the sprite, where PNG anti-aliasing leaves RGB values that are
 * partially magenta and partially sprite color. A plain distance check
 * would also eat dark outline strokes (rgb 20,20,20 is ~126 weighted
 * units from magenta), so we use a magenta-axis predicate instead:
 * only pixels with elevated r/b and depressed g qualify. This rejects
 * dark neutrals while still catching the magenta-hair / magenta-skin
 * anti-alias fringe.
 */
function isMagentaLeaning(r: number, g: number, b: number): boolean {
    // r > 80 && b > 80 catches the bulk magenta-tinted edge AA pixels.
    // g < 120 is the discriminator: real magenta has near-zero green;
    // any color with non-trivial green (brown shadows, skin, shirt)
    // is rejected. The residual 1px purple fringe at the silhouette
    // (e.g. rgb(74, 0, 72) which fails r > 80) is a known minor
    // artifact — see keyOut comment for the deliberate trade-off.
    return r > 80 && b > 80 && g < 120;
}

/**
 * Sub-threshold magenta-axis predicate for the residual fringe. Catches
 * AA pixels the main keyer dropped because their r/b fall below `r > 80`
 * (e.g. rgb(74, 0, 72)). Near-zero green + r≈b is the safe discriminator:
 * real sprite shadows (skin, clothes) always have non-trivial green.
 */
function isResidualMagenta(r: number, g: number, b: number): boolean {
    return g < 30 && Math.abs(r - b) < 30;
}

/**
 * Edge cleanup: paint black on silhouette-boundary pixels that are
 * magenta-leaning but weren't cleared by `keyOut` — the residual 1px
 * purple ring. Real outline pixels (already near-black) pass through;
 * non-magenta sprite pixels fail `isResidualMagenta` and are skipped.
 */
function blackenMagentaFringe(png: PNG): void {
    const { data, width: w, height: h } = png;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = (w * y + x) << 2;
            if (data[i + 3] === 0) continue;
            const r = data[i], g = data[i + 1], b = data[i + 2];
            if (r === 0 && g === 0 && b === 0) continue;
            const onEdge =
                (x > 0 && data[((w * y + x - 1) << 2) + 3] === 0) ||
                (x < w - 1 && data[((w * y + x + 1) << 2) + 3] === 0) ||
                (y > 0 && data[((w * (y - 1) + x) << 2) + 3] === 0) ||
                (y < h - 1 && data[((w * (y + 1) + x) << 2) + 3] === 0);
            if (!onEdge) continue;
            if (!isResidualMagenta(r, g, b)) continue;
            data[i] = 0;
            data[i + 1] = 0;
            data[i + 2] = 0;
            data[i + 3] = 255;
        }
    }
}

/**
 * Zero the alpha of every magenta background pixel, in place.
 *
 * Two passes:
 *   1. 4-connected flood-fill from a corner seed using the magenta-
 *      axis predicate. Marks the unambiguous background; interior
 *      pixels that happen to be magenta-tinted (pink shirt) are
 *      spared because they are not 4-connected to the corner.
 *   2. Edge dilation: opaque pixels adjacent to the bg mask are
 *      re-evaluated with the same predicate. This catches the
 *      magenta-hair / magenta-skin anti-aliasing fringe without
 *      killing interior color.
 *
 * Falls back to a global scan if no corner is magenta.
 */
export function keyOut(png: PNG, opts: { blackFringe?: boolean } = {}): void {
    const { data, width: w, height: h } = png;
    const seed = findKeySeed(png);
    if (!seed) {
        for (let i = 0; i < data.length; i += 4) {
            if (isMagentaLeaning(data[i], data[i + 1], data[i + 2])) data[i + 3] = 0;
        }
        stripEdgeHalo(png);
        return;
    }

    const isBg = new Uint8Array(w * h);
    floodFill(png, seed.x, seed.y, (x, y) => {
        const idx = w * y + x;
        const i = idx << 2;
        // Only mark pixels that are magenta-tinted (high r/b, low g).
        // This rejects dark outline strokes and body shadows like
        // rgb(80,80,100) which a distance-based check would wrongly
        // absorb.
        if (!isMagentaLeaning(data[i], data[i + 1], data[i + 2])) return false;
        isBg[idx] = 1;
        return true;
    });

    for (let idx = 0; idx < w * h; idx++) {
        if (isBg[idx]) data[(idx << 2) + 3] = 0;
    }

    // Edge dilation: pixels adjacent to bg get re-evaluated. We use
    // a magenta-axis predicate (not distance) so dark outline strokes
    // survive — they are 4-neighbors of magenta but are not magenta-
    // tinted themselves, so the predicate rejects them.
    // ponytail: 4-connectivity only; 8-connectivity would also catch
    // diagonally-adjacent magenta, but the AI sheets tested never
    // need it and skipping it shaves one branch per pixel.
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const idx = w * y + x;
            if (isBg[idx]) continue;
            const i = idx << 2;
            if (data[i + 3] === 0) continue;
            const onEdge =
                (x > 0 && isBg[idx - 1]) ||
                (x < w - 1 && isBg[idx + 1]) ||
                (y > 0 && isBg[idx - w]) ||
                (y < h - 1 && isBg[idx + w]);
            if (onEdge && isMagentaLeaning(data[i], data[i + 1], data[i + 2])) {
                data[i + 3] = 0;
            }
        }
    }

    stripEdgeHalo(png);
    if (opts.blackFringe) blackenMagentaFringe(png);
}

/**
 * Indices of runs where `occupied` is true, as [start, endExclusive].
 * Runs shorter than `minRun` are dropped (kills chroma-key speckle).
 */
export function runs(occupied: boolean[], minRun: number): [number, number][] {
    const out: [number, number][] = [];
    let start = -1;
    for (let i = 0; i <= occupied.length; i++) {
        if (occupied[i]) {
            if (start < 0) start = i;
        } else if (start >= 0) {
            if (i - start >= minRun) out.push([start, i]);
            start = -1;
        }
    }
    return out;
}

interface Box {
    x: number;
    y: number;
    w: number;
    h: number;
}

/** Alpha-occupancy projection of a sub-rect onto one axis. */
function project(png: PNG, box: Box, axis: 'x' | 'y', minAlpha: number): boolean[] {
    const len = axis === 'x' ? box.w : box.h;
    const occupied = new Array<boolean>(len).fill(false);
    for (let y = box.y; y < box.y + box.h; y++) {
        for (let x = box.x; x < box.x + box.w; x++) {
            if (png.data[((png.width * y + x) << 2) + 3] <= minAlpha) continue;
            occupied[axis === 'x' ? x - box.x : y - box.y] = true;
        }
    }
    return occupied;
}

/** Shrink a box to its opaque content. */
function tighten(png: PNG, box: Box): Box {
    const cols = runs(project(png, box, 'x', 8), 1);
    const rows = runs(project(png, box, 'y', 8), 1);
    if (!cols.length || !rows.length) return box;
    const x0 = cols[0][0];
    const x1 = cols[cols.length - 1][1];
    const y0 = rows[0][0];
    const y1 = rows[rows.length - 1][1];
    return { x: box.x + x0, y: box.y + y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * Find frame boxes: horizontal bands of content, then columns within
 * each band. `minRun` rejects speckle; `minArea` rejects stray marks
 * (the Gemini sparkle watermark).
 */
export function findFrames(png: PNG, minRun = 8, minArea = 2000): Box[] {
    const sheet: Box = { x: 0, y: 0, w: png.width, h: png.height };
    const out: Box[] = [];
    for (const [y0, y1] of runs(project(png, sheet, 'y', 8), minRun)) {
        const band: Box = { x: 0, y: y0, w: png.width, h: y1 - y0 };
        for (const [x0, x1] of runs(project(png, band, 'x', 8), minRun)) {
            const box = tighten(png, { x: x0, y: band.y, w: x1 - x0, h: band.h });
            if (box.w * box.h >= minArea) out.push(box);
        }
    }
    return out;
}

/**
 * Alpha-weighted box-average downsample. Each target pixel averages the
 * RGB of source pixels in its region, weighted by source alpha so the
 * chroma-keyed transparent borders don't bleed into the sprite body.
 * Output alpha is the mean source alpha, rounded.
 *
 * Target regions fully outside the sprite (all-transparent) stay
 * transparent — keeps the outline sharp rather than smearing the
 * background into a halo.
 */
export function downsample(src: PNG, targetW: number, targetH: number): PNG {
    const out = new PNG({ width: targetW, height: targetH });
    out.data.fill(0);
    const sx = src.width / targetW;
    const sy = src.height / targetH;
    for (let ty = 0; ty < targetH; ty++) {
        for (let tx = 0; tx < targetW; tx++) {
            const x0 = Math.floor(tx * sx);
            const x1 = Math.min(src.width, Math.max(x0 + 1, Math.floor((tx + 1) * sx)));
            const y0 = Math.floor(ty * sy);
            const y1 = Math.min(src.height, Math.max(y0 + 1, Math.floor((ty + 1) * sy)));
            let r = 0, g = 0, b = 0, wSum = 0, count = 0;
            for (let y = y0; y < y1; y++) {
                for (let x = x0; x < x1; x++) {
                    const i = (src.width * y + x) << 2;
                    const sa = src.data[i + 3];
                    if (sa === 0) continue;
                    r += src.data[i] * sa;
                    g += src.data[i + 1] * sa;
                    b += src.data[i + 2] * sa;
                    wSum += sa;
                    count++;
                }
            }
            if (count === 0) continue;
            const oi = (targetW * ty + tx) << 2;
            out.data[oi] = Math.round(r / wSum);
            out.data[oi + 1] = Math.round(g / wSum);
            out.data[oi + 2] = Math.round(b / wSum);
            out.data[oi + 3] = Math.min(255, Math.round(wSum / count));
        }
    }
    return out;
}

/**
 * Median-cut color quantizer. Splits the longest RGB axis of the
 * largest bucket, recursively, until we have `nColors` buckets. Each
 * bucket's mean becomes a centroid; every opaque pixel snaps to the
 * nearest centroid. Transparent pixels are passed through untouched.
 *
 * Standard palette-reduction alg for true pixel-art output — GIMP,
 * Aseprite, etc. all use median-cut or k-means under the hood.
 */
export function quantize(png: PNG, nColors: number): void {
    const opaque: Array<[number, number, number]> = [];
    for (let i = 0; i < png.data.length; i += 4) {
        if (png.data[i + 3] === 0) continue;
        opaque.push([png.data[i], png.data[i + 1], png.data[i + 2]]);
    }
    if (opaque.length === 0) return;
    const buckets: Array<Array<[number, number, number]>> = [opaque];
    while (buckets.length < nColors) {
        let bestIdx = -1;
        let bestRange = 0;
        let bestAxis = 0;
        for (let i = 0; i < buckets.length; i++) {
            const b = buckets[i];
            if (b.length < 2) continue;
            let rMin = 255, rMax = 0, gMin = 255, gMax = 0, bMin = 255, bMax = 0;
            for (const px of b) {
                if (px[0] < rMin) rMin = px[0];
                if (px[0] > rMax) rMax = px[0];
                if (px[1] < gMin) gMin = px[1];
                if (px[1] > gMax) gMax = px[1];
                if (px[2] < bMin) bMin = px[2];
                if (px[2] > bMax) bMax = px[2];
            }
            const rR = rMax - rMin;
            const gR = gMax - gMin;
            const bR = bMax - bMin;
            const maxR = Math.max(rR, gR, bR);
            if (maxR > bestRange) {
                bestRange = maxR;
                bestIdx = i;
                bestAxis = maxR === rR ? 0 : maxR === gR ? 1 : 2;
            }
        }
        if (bestIdx < 0 || bestRange === 0) break;
        const bucket = buckets.splice(bestIdx, 1)[0];
        bucket.sort((p, q) => p[bestAxis] - q[bestAxis]);
        const mid = bucket.length >> 1;
        buckets.push(bucket.slice(0, mid));
        buckets.push(bucket.slice(mid));
    }
    const centroids: Array<[number, number, number]> = buckets.map((b) => {
        let r = 0, g = 0, bb = 0;
        for (const px of b) {
            r += px[0];
            g += px[1];
            bb += px[2];
        }
        const n = b.length || 1;
        return [Math.round(r / n), Math.round(g / n), Math.round(bb / n)];
    });
    for (let i = 0; i < png.data.length; i += 4) {
        if (png.data[i + 3] === 0) continue;
        const r = png.data[i];
        const g = png.data[i + 1];
        const b = png.data[i + 2];
        let best = Infinity;
        let bestIdx = 0;
        for (let c = 0; c < centroids.length; c++) {
            const [cr, cg, cb] = centroids[c];
            const dr = r - cr;
            const dg = g - cg;
            const db = b - cb;
            const d = dr * dr + dg * dg + db * db;
            if (d < best) {
                best = d;
                bestIdx = c;
            }
        }
        const [nr, ng, nb] = centroids[bestIdx];
        png.data[i] = nr;
        png.data[i + 1] = ng;
        png.data[i + 2] = nb;
    }
}

/** Copy a box out of `src` into a new PNG, with transparent padding. */
export function crop(src: PNG, box: Box, pad: number): PNG {
    const out = new PNG({ width: box.w + pad * 2, height: box.h + pad * 2 });
    out.data.fill(0);
    for (let y = 0; y < box.h; y++) {
        for (let x = 0; x < box.w; x++) {
            const s = (src.width * (box.y + y) + box.x + x) << 2;
            const d = (out.width * (y + pad) + x + pad) << 2;
            const a = src.data[s + 3];
            out.data[d] = src.data[s];
            out.data[d + 1] = src.data[s + 1];
            out.data[d + 2] = src.data[s + 2];
            // Zero RGB under transparent pixels so dark backgrounds
            // don't bleed the magenta-composited color through.
            out.data[d + 3] = a === 0 ? 0 : a;
        }
    }
    return out;
}

function main(): void {
    const [src, outDir, ...flags] = process.argv.slice(2);
    if (!src || !outDir) {
        console.error(
            'usage: tsx scripts/split-sheet.ts <sheet.png> <outDir> [--pad=2] [--no-black-fringe]\n' +
                '                                       [--pixelize[=WxH]] [--colors=N] [--rows=N --cols=M] [--no-recompose]\n' +
                '       tsx scripts/split-sheet.ts --recompose <outDir> <orig.png> ' +
                '--rows=N --cols=M [<out.png>]',
        );
        process.exit(1);
    }
    if (src === '--recompose') {
        const origPath = flags[0];
        if (!origPath) {
            console.error(
                'usage: tsx scripts/split-sheet.ts --recompose <outDir> <orig.png> ' +
                    '--rows=N --cols=M [<out.png>]',
            );
            process.exit(1);
        }
        const rows = Number(flags.find((f) => f.startsWith('--rows='))?.slice(7));
        const cols = Number(flags.find((f) => f.startsWith('--cols='))?.slice(7));
        if (!Number.isFinite(rows) || !Number.isFinite(cols) || rows < 1 || cols < 1) {
            console.error('--rows=N and --cols=M are required and must be >= 1');
            process.exit(1);
        }
        // Outfile is the next positional after origPath, default to
        // <outDir>/recomposed.png when not supplied.
        const positional = flags.filter((f) => !f.startsWith('--') && f !== origPath);
        const outFile = positional[0] ?? join(outDir, 'recomposed.png');
        recompose(outDir, origPath, rows, cols, outFile);
        return;
    }
    const pad = Number(flags.find((f) => f.startsWith('--pad='))?.slice(6) ?? 2);
    const blackFringe = !flags.includes('--no-black-fringe');
    // `--pixelize[=N]` enables the pixel-art pipeline. `N` is a scale
    // factor (sheet downsampled by N). Default 4 takes a 2048 sheet to
    // 512. `--colors=N` picks palette size (default 64).
    const pixelizeArg = flags.find(
        (f) => f === '--pixelize' || f.startsWith('--pixelize='),
    );
    const pixelize = !!pixelizeArg;
    const pixelizeScale = pixelizeArg && pixelizeArg.includes('=')
        ? Number(pixelizeArg.slice('--pixelize='.length))
        : 4;
    const colors = Number(
        flags.find((f) => f.startsWith('--colors='))?.slice(9) ?? 64,
    );

    const png = PNG.sync.read(readFileSync(src));
    keyOut(png, { blackFringe });

    // Pixelize at the sheet level so every layer (sheet, cells, frame
    // content) scales by the same factor — frame centers stay aligned
    // to the same grid positions, just smaller. Quantize the whole
    // sheet at once for a single global palette (true pixel-art look).
    let workPng: PNG = png;
    if (pixelize) {
        if (!Number.isFinite(pixelizeScale) || pixelizeScale < 2) {
            throw new Error(
                `--pixelize requires scale >= 2 (sheet is downsampled by this factor)`,
            );
        }
        const smallerW = Math.max(1, Math.floor(png.width / pixelizeScale));
        const smallerH = Math.max(1, Math.floor(png.height / pixelizeScale));
        workPng = downsample(png, smallerW, smallerH);
        quantize(workPng, colors);
    }
    // Area threshold scales as 1/scale²: frames shrink with the sheet,
    // so a 2000 px threshold on the 1× sheet is ~31 px at 8×, which
    // would drop every frame. Floor at 100 to avoid catching speckle.
    const minArea = pixelize
        ? Math.max(100, Math.floor(2000 / (pixelizeScale * pixelizeScale)))
        : 2000;
    const frames = findFrames(workPng, 8, minArea);

    mkdirSync(outDir, { recursive: true });
    // ponytail: wipe old frame-*.png so a re-run with different tuning
    // can't leave stale frames behind.
    for (const f of readdirSync(outDir)) {
        if (/^frame-\d+\.png$/.test(f)) rmSync(join(outDir, f));
    }
    frames.forEach((box, i) => {
        const name = `frame-${String(i).padStart(2, '0')}.png`;
        const frame = crop(workPng, box, pad);
        writeFileSync(join(outDir, name), PNG.sync.write(frame));
        console.log(`${name}  ${frame.width}x${frame.height}  @ ${box.x},${box.y}`);
    });
    console.log(`\n${frames.length} frames → ${outDir}`);
    if (pixelize) {
        console.log(
            `  pixelize: sheet → ${workPng.width}x${workPng.height} (scale ${pixelizeScale}), palette: ${colors} colors`,
        );
    }

    // Auto-recompose using the source grid. The grid is detected from
    // frame bounding box positions so the user doesn't need to count
    // rows/cols manually. --rows / --cols override; --no-recompose skips.
    if (!flags.includes('--no-recompose')) {
        const rowsArg = Number(flags.find((f) => f.startsWith('--rows='))?.slice(7));
        const colsArg = Number(flags.find((f) => f.startsWith('--cols='))?.slice(7));
        const grid =
            Number.isFinite(rowsArg) && Number.isFinite(colsArg)
                ? { rows: rowsArg, cols: colsArg }
                : detectGrid(frames);
        const outFile = join(outDir, 'recomposed.png');
        recompose(outDir, src, grid.rows, grid.cols, outFile, workPng);
    }
}

/**
 * Infer the sheet's grid from frame bounding box positions. Walks
 * frames in y-then-x order and detects row breaks by large gaps
 * in the y sequence. The col count is the widest row.
 *
 * This handles AI-generated sheets where the last row's y-positions
 * are slightly inconsistent (e.g. y=1549,1608,1638) — a fixed
 * tolerance misses them; a gap-based approach catches them because
 * the inter-row gap (~500px) dwarfs the intra-row variance (~90px).
 */
function detectGrid(frames: Box[]): { rows: number; cols: number } {
    if (frames.length === 0) return { rows: 0, cols: 0 };
    if (frames.length === 1) return { rows: 1, cols: 1 };
    const sorted = [...frames].sort((a, b) => a.y - b.y || a.x - b.x);
    const ys = sorted.map((f) => f.y);
    let maxGap = 0;
    for (let i = 1; i < ys.length; i++) {
        const g = ys[i] - ys[i - 1];
        if (g > maxGap) maxGap = g;
    }
    // A row break is a gap > 40% of the largest gap. Clamped to 20px
    // minimum so tiny layouts (frame-y deltas of a few pixels) still
    // break correctly.
    const rowThreshold = Math.max(20, Math.floor(maxGap * 0.4));
    const rows: Box[][] = [[sorted[0]]];
    for (let i = 1; i < sorted.length; i++) {
        if (ys[i] - ys[i - 1] > rowThreshold) rows.push([sorted[i]]);
        else rows[rows.length - 1].push(sorted[i]);
    }
    const cols = Math.max(...rows.map((r) => r.length));
    return { rows: rows.length, cols };
}

/**
 * Reassemble the split frames back into a single PNG at the original
 * sheet's dimensions, using a uniform `rows x cols` grid. The frame
 * at index `i` is placed at the center of grid cell `(i/cols, i%cols)`.
 * No sidecar needed: the grid is given by the caller and the frame
 * order is `frame-00.png`, `frame-01.png`, ...
 *
 * Useful for diffing the split against the original to spot missed
 * regions or wrong bounding boxes.
 */
export function recompose(
    outDir: string,
    origPath: string,
    rows: number,
    cols: number,
    outFile: string,
    sourcePng?: PNG,
): void {
    // Sheet dimensions come from the pixelize-pass output when present
    // (smaller sheet after sheet-level downsample), otherwise from the
    // original file. Cell size is `sheet.width / cols` either way.
    const sheet = sourcePng ?? PNG.sync.read(readFileSync(origPath));
    const cw = sheet.width / cols;
    const ch = sheet.height / rows;
    const canvas = new PNG({ width: sheet.width, height: sheet.height });
    canvas.data.fill(0);
    const names = readdirSync(outDir)
        .filter((f) => /^frame-\d+\.png$/.test(f))
        .sort();
    for (let i = 0; i < names.length; i++) {
        const row = Math.floor(i / cols);
        const col = i % cols;
        const cx = col * cw + cw / 2;
        const cy = row * ch + ch / 2;
        const frame = PNG.sync.read(readFileSync(join(outDir, names[i])));
        const startX = Math.round(cx - frame.width / 2);
        const startY = Math.round(cy - frame.height / 2);
        for (let y = 0; y < frame.height; y++) {
            const dy = startY + y;
            if (dy < 0 || dy >= canvas.height) continue;
            for (let x = 0; x < frame.width; x++) {
                const dx = startX + x;
                if (dx < 0 || dx >= canvas.width) continue;
                const s = (frame.width * y + x) << 2;
                const d = (canvas.width * dy + dx) << 2;
                if (frame.data[s + 3] === 0) continue;
                canvas.data[d] = frame.data[s];
                canvas.data[d + 1] = frame.data[s + 1];
                canvas.data[d + 2] = frame.data[s + 2];
                canvas.data[d + 3] = frame.data[s + 3];
            }
        }
    }
    writeFileSync(outFile, PNG.sync.write(canvas));
    console.log(`recomposed ${names.length} frames in ${rows}x${cols} grid → ${outFile}`);
}

if (process.argv[1]?.endsWith('split-sheet.ts')) main();
