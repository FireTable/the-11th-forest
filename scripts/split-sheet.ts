/**
 * Universal AI Sprite Sheet Splitter & Chroma-Key Processor.
 *
 * Automatically detects background color (Magenta, Green screen, Blue screen, etc.),
 * performs intelligent CIEDE2000 + Lch Hue color-keying, purges narrow crevice micro-holes,
 * applies 8-connected pixel-level edge erosion/outlining, downsamples crisp pixel-art,
 * quantizes palette with image-q NeuQuant (optional 32 colors), and crops transparent frames.
 *
 * Usage:
 *   # Default: Auto-detect background, 2px transparent edge erosion, 2px padding
 *   pnpm tsx scripts/split-sheet.ts <sheet.png> <outDir> [--pad=2] [--outline=2] [--no-recompose]
 *
 *   # Downsample & Quantize (Decoupled: --downsample=4, --colors=32, optional --dither):
 *   pnpm tsx scripts/split-sheet.ts <sheet.png> <outDir> --downsample=4 --colors=32 [--dither] [--in-place --id=wanderer]
 *
 *   # Recompose grid:
 *   pnpm tsx scripts/split-sheet.ts --recompose <outDir> <orig.png> --rows=N --cols=M [<out.png>]
 *
 * Default Settings:
 *   - Background: Auto-detected from 4 corners (detectKeyColor)
 *   - Edge Erosion (--outline): 2px (8-connected pass)
 *   - Outline Color (--outline-color): transparent (strips anti-aliasing fringe)
 *   - Padding (--pad): 2px transparent border
 *   - Resolution Downsample (--downsample=N): Optional physical scale down (default 4 when passed)
 *   - Quantization Palette (--colors=N): Optional image-q NeuQuant color reduction (default 32 when passed)
 *
 * Flowchart Diagram:
 *
 *   ┌────────────────────────────────────────────────────────┐
 *   │            Input AI Sprite Sheet (PNG)                 │
 *   └───────────────────────────┬────────────────────────────┘
 *                               │
 *                               ▼
 *   ┌────────────────────────────────────────────────────────┐
 *   │ Step 1: detectKeyColor (Auto Corner Sampling)          │
 *   └───────────────────────────┬────────────────────────────┘
 *                               │
 *                               ▼
 *   ┌────────────────────────────────────────────────────────┐
 *   │ Step 2: Outer FloodFill (CIEDE2000 + Lch Hue Match)     │
 *   └───────────────────────────┬────────────────────────────┘
 *                               │
 *                               ▼
 *   ┌────────────────────────────────────────────────────────┐
 *   │ Step 3: Pure Hole FloodFill & Micro-Hole Purger        │
 *   │ (Purge Boundary-Touching Crevices w/ Lch Safeguards)   │
 *   └───────────────────────────┬────────────────────────────┘
 *                               │
 *                               ▼
 *   ┌────────────────────────────────────────────────────────┐
 *   │ Step 4: 8-Connected Pixel Outline / Edge Erosion      │
 *   │ (N-Pass Inward Erosion: Transparent or Pixel-Stroke)   │
 *   └───────────────────────────┬────────────────────────────┘
 *                               │
 *                               ▼
 *   ┌────────────────────────────────────────────────────────┐
 *   │ Step 5: Downsample & Image-Q Quantize (Optional Flags) │
 *   │ (--downsample: Nearest-Center | --colors: NeuQuant)   │
 *   └───────────────────────────┬────────────────────────────┘
 *                               │
 *                               ▼
 *   ┌────────────────────────────────────────────────────────┐
 *   │ Step 6: Crop Frames with Transparent Edge Padding     │
 *   └────────────────────────────────────────────────────────┘
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';

import { PNG } from 'pngjs';
import { colord, extend, AnyColor } from 'colord';
import lchPlugin from 'colord/plugins/lch';
import labPlugin from 'colord/plugins/lab';
import * as iq from 'image-q';

extend([lchPlugin, labPlugin]);

/**
 * 4-connected flood-fill from a seed. Iterative (stack, not recursion)
 * so a 2048×2048 background field never blows the call stack.
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

/** Detect key background color from four corners */
function detectKeyColor(png: PNG): AnyColor {
    const { width, height, data } = png;
    const corners = [
        [0, 0],
        [width - 1, 0],
        [0, height - 1],
        [width - 1, height - 1],
    ] as const;
    for (const [x, y] of corners) {
        const i = (width * y + x) << 2;
        if (data[i + 3] > 0) {
            return { r: data[i], g: data[i + 1], b: data[i + 2] };
        }
    }
    return { r: 255, g: 0, b: 255 }; // Fallback to magenta if all corners are transparent
}

function isBgColorLeaning(
    r: number,
    g: number,
    b: number,
    keyColor: AnyColor,
    opts: { relaxed?: boolean } = {},
): boolean {
    const c = colord({ r, g, b });
    const targetKey = colord(keyColor);
    if (c.delta(targetKey) < 0.14) return true;

    const lch = c.toLch();
    const targetLch = targetKey.toLch();
    const hueDiff = Math.abs(lch.h - targetLch.h);
    const isHueSimilar = hueDiff <= 25 || hueDiff >= 335;

    if (opts.relaxed) {
        // On boundary edges, relax lightness/chroma thresholds to catch dark corner fringe
        return lch.c > 25 && isHueSimilar;
    }

    return lch.l > 45 && lch.c > 35 && isHueSimilar;
}

function findKeySeed(png: PNG, keyColor: AnyColor): { x: number; y: number } | null {
    const { width, height, data } = png;
    const corners = [
        [0, 0],
        [width - 1, 0],
        [0, height - 1],
        [width - 1, height - 1],
    ] as const;
    for (const [x, y] of corners) {
        const i = (width * y + x) << 2;
        if (isBgColorLeaning(data[i], data[i + 1], data[i + 2], keyColor)) return { x, y };
    }
    return null;
}

function stripEdgeHalo(png: PNG, keyColor: AnyColor): void {
    const { data } = png;
    for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3];
        if (a === 0 || a === 255) continue;
        if (isBgColorLeaning(data[i], data[i + 1], data[i + 2], keyColor, { relaxed: true }))
            data[i + 3] = 0;
    }
}

/** Despill/desaturate residual edge fringe color into dark neutral shades */
function despillEdgeFringe(png: PNG, keyColor: AnyColor): void {
    const { data, width: w, height: h } = png;
    const targetKey = colord(keyColor);
    const targetLch = targetKey.toLch();

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const idx = w * y + x;
            const i = idx << 2;
            if (data[i + 3] === 0) continue;

            // Check if on transparent boundary
            const onEdge =
                (x > 0 && data[((w * y + x - 1) << 2) + 3] === 0) ||
                (x < w - 1 && data[((w * y + x + 1) << 2) + 3] === 0) ||
                (y > 0 && data[((w * (y - 1) + x) << 2) + 3] === 0) ||
                (y < h - 1 && data[((w * (y + 1) + x) << 2) + 3] === 0);

            if (!onEdge) continue;

            const c = colord({ r: data[i], g: data[i + 1], b: data[i + 2] });
            const lch = c.toLch();
            const hueDiff = Math.abs(lch.h - targetLch.h);
            const isHueSimilar = hueDiff <= 35 || hueDiff >= 325;

            // Despill: pull down only the background tint channel rather than mixing with gray
            if (isHueSimilar && lch.c > 20) {
                const keyRgb = targetKey.toRgb();
                // If background is Magenta-dominant (high R&B, low G), suppress green/magenta bias
                if (keyRgb.r > 200 && keyRgb.b > 200) {
                    const avg = Math.round((data[i] + data[i + 2]) / 2);
                    if (data[i + 1] < avg * 0.8) {
                        data[i] = Math.round(data[i] * 0.8 + data[i + 1] * 0.2);
                        data[i + 2] = Math.round(data[i + 2] * 0.8 + data[i + 1] * 0.2);
                    }
                } else if (keyRgb.g > 200) {
                    // If Green screen, suppress green channel spill
                    data[i + 1] = Math.min(data[i + 1], Math.round((data[i] + data[i + 2]) / 2));
                }
            }
        }
    }
}

/**
 * Purge isolated micro-hole islands in narrow crevices (Area <= maxHoleArea).
 * Strictly requires the component to touch a transparent border to prevent eroding interior details (like bows).
 */
function cleanMicroHoles(png: PNG, keyColor: AnyColor, maxHoleArea = 100): void {
    const { width: w, height: h, data } = png;
    const visited = new Uint8Array(w * h);
    const targetKey = colord(keyColor);
    const targetLch = targetKey.toLch();

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const idx = y * w + x;
            if (visited[idx]) continue;
            const di = idx << 2;
            if (data[di + 3] === 0) continue;

            const c = colord({ r: data[di], g: data[di + 1], b: data[di + 2] });
            const lch = c.toLch();
            const hueDiff = Math.abs(lch.h - targetLch.h);
            const isHueSimilar = hueDiff <= 35 || hueDiff >= 325;
            // Protect dark/black objects (lch.l <= 40) and low-chroma items (lch.c <= 30)
            const isFringeHole = isHueSimilar && lch.c > 30 && lch.l > 40;
            if (!isFringeHole) continue;

            const component: number[] = [];
            const stack = [idx];
            visited[idx] = 1;
            let touchesTransparentBorder = false;

            while (stack.length) {
                const i = stack.pop()!;
                component.push(i);
                if (component.length > maxHoleArea) break;

                const ix = i % w;
                const iy = (i - ix) / w;
                const neighbors = [
                    ix > 0 ? i - 1 : -1,
                    ix < w - 1 ? i + 1 : -1,
                    iy > 0 ? i - w : -1,
                    iy < h - 1 ? i + w : -1,
                ];

                for (const n of neighbors) {
                    if (n < 0) {
                        touchesTransparentBorder = true;
                        continue;
                    }
                    const ndi = n << 2;
                    if (data[ndi + 3] === 0) {
                        touchesTransparentBorder = true;
                        continue;
                    }
                    if (visited[n]) continue;

                    const nc = colord({ r: data[ndi], g: data[ndi + 1], b: data[ndi + 2] });
                    const nlch = nc.toLch();
                    const nhueDiff = Math.abs(nlch.h - targetLch.h);
                    const nHueSimilar = nhueDiff <= 35 || nhueDiff >= 325;
                    const nFringeHole = nHueSimilar && nlch.c > 30 && nlch.l > 40;
                    if (nFringeHole) {
                        visited[n] = 1;
                        stack.push(n);
                    }
                }
            }

            // Only clear if component touches a transparent border and is a small crevice
            if (touchesTransparentBorder && component.length <= maxHoleArea) {
                for (const i of component) {
                    data[(i << 2) + 3] = 0;
                }
            }
        }
    }
}

/**
 * Flood-fill every background-like region from any seed to catch isolated interior pockets.
 */
function pureBgFloodFill(png: PNG, keyColor: AnyColor): void {
    const { width: w, height: h, data } = png;
    const visited = new Uint8Array(w * h);
    const stack: number[] = [];
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const idx = y * w + x;
            if (visited[idx]) continue;
            const di = idx << 2;
            if (
                data[di + 3] === 0 ||
                !isBgColorLeaning(data[di], data[di + 1], data[di + 2], keyColor)
            )
                continue;
            stack.push(idx);
            while (stack.length) {
                const i = stack.pop()!;
                if (visited[i]) continue;
                visited[i] = 1;
                const ddi = i << 2;
                if (
                    data[ddi + 3] === 0 ||
                    !isBgColorLeaning(data[ddi], data[ddi + 1], data[ddi + 2], keyColor)
                )
                    continue;
                data[ddi + 3] = 0;
                const ix = i % w;
                const iy = (i - ix) / w;
                if (ix > 0) stack.push(i - 1);
                if (ix < w - 1) stack.push(i + 1);
                if (iy > 0) stack.push(i - w);
                if (iy < h - 1) stack.push(i + w);
            }
        }
    }
}

/**
 * Pixel-art Outline Generator (Support N-pixel thickness and 4/8-connected pixel stroke).
 *
 * Scans image boundary to generate clean, solid dark outlines.
 * - `outlineWidth`: Thickness of the stroke (1px, 2px, etc.)
 * - `mode`: 'inner' (replaces edge pixels) or 'outer' (expands into transparent area)
 */
function applyPixelOutline(
    png: PNG,
    opts: { outlineWidth?: number; outlineColor?: [number, number, number] | 'transparent' } = {},
): void {
    const strokeWidth = opts.outlineWidth ?? 2;
    if (strokeWidth <= 0) return;

    const color = opts.outlineColor ?? 'transparent';
    const { data, width: w, height: h } = png;

    // Track pixels that are transparent or already part of the outer edge stroke
    const isBgOrBorder = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
        if (data[(i << 2) + 3] === 0) {
            isBgOrBorder[i] = 1;
        }
    }

    for (let pass = 0; pass < strokeWidth; pass++) {
        const nextEdgeIndices: number[] = [];
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const idx = w * y + x;
                if (isBgOrBorder[idx]) continue;

                // Check 8-connected neighbor for border/transparent (prevents diagonal fringe leaks)
                const onEdge =
                    (x > 0 && isBgOrBorder[idx - 1]) ||
                    (x < w - 1 && isBgOrBorder[idx + 1]) ||
                    (y > 0 && isBgOrBorder[idx - w]) ||
                    (y < h - 1 && isBgOrBorder[idx + w]) ||
                    (x > 0 && y > 0 && isBgOrBorder[idx - w - 1]) ||
                    (x < w - 1 && y > 0 && isBgOrBorder[idx - w + 1]) ||
                    (x > 0 && y < h - 1 && isBgOrBorder[idx + w - 1]) ||
                    (x < w - 1 && y < h - 1 && isBgOrBorder[idx + w + 1]);

                if (onEdge) {
                    nextEdgeIndices.push(idx);
                }
            }
        }

        // Apply dark outline stroke or erase to transparent
        for (const idx of nextEdgeIndices) {
            const i = idx << 2;
            if (color === 'transparent') {
                data[i + 3] = 0;
            } else {
                data[i] = color[0];
                data[i + 1] = color[1];
                data[i + 2] = color[2];
                data[i + 3] = 255;
            }
            isBgOrBorder[idx] = 1; // Mark as processed
        }
    }
}

export function keyOut(
    png: PNG,
    opts: { outlineWidth?: number; outlineColor?: [number, number, number] | 'transparent' } = {},
): void {
    const { data, width: w, height: h } = png;
    const keyColor = detectKeyColor(png);
    const seed = findKeySeed(png, keyColor);
    if (!seed) {
        for (let i = 0; i < data.length; i += 4) {
            if (isBgColorLeaning(data[i], data[i + 1], data[i + 2], keyColor)) data[i + 3] = 0;
        }
        stripEdgeHalo(png, keyColor);
        pureBgFloodFill(png, keyColor);
        applyPixelOutline(png, opts);
        return;
    }

    const isBg = new Uint8Array(w * h);
    floodFill(png, seed.x, seed.y, (x, y) => {
        const idx = w * y + x;
        const i = idx << 2;
        if (!isBgColorLeaning(data[i], data[i + 1], data[i + 2], keyColor)) return false;
        isBg[idx] = 1;
        return true;
    });

    for (let idx = 0; idx < w * h; idx++) {
        if (isBg[idx]) data[(idx << 2) + 3] = 0;
    }

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
            if (onEdge && isBgColorLeaning(data[i], data[i + 1], data[i + 2], keyColor)) {
                data[i + 3] = 0;
            }
        }
    }

    stripEdgeHalo(png, keyColor);
    // Remove isolated interior background islands
    pureBgFloodFill(png, keyColor);
    cleanMicroHoles(png, keyColor, 120);
    applyPixelOutline(png, opts);
    despillEdgeFringe(png, keyColor);
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

/**
 * Find frame boxes using 2D 8-Connected Component BFS.
 * Identifies each isolated island of opaque pixels independently,
 * eliminating the issue where vertically-overlapping items get merged together.
 */
export function findFrames(png: PNG, _minRun = 8, _minArea = 500): Box[] {
    const { width: w, height: h, data } = png;
    const visited = new Uint8Array(w * h);
    const boxes: Box[] = [];

    // Helper: is pixel opaque (alpha > 10)?
    const isOpaque = (x: number, y: number): boolean => {
        return data[((y * w + x) << 2) + 3] > 10;
    };

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const idx = y * w + x;
            if (visited[idx] || !isOpaque(x, y)) continue;

            // Start BFS to flood-fill this connected component
            let minX = x;
            let maxX = x;
            let minY = y;
            let maxY = y;
            let pixelCount = 0;

            // BFS Queue using flat Array (efficient for modest component sizes)
            const queue: number[] = [idx];
            visited[idx] = 1;

            let head = 0;
            while (head < queue.length) {
                const currIdx = queue[head++];
                const cx = currIdx % w;
                const cy = Math.floor(currIdx / w);

                pixelCount++;
                if (cx < minX) minX = cx;
                if (cx > maxX) maxX = cx;
                if (cy < minY) minY = cy;
                if (cy > maxY) maxY = cy;

                // Check 8-connected neighbors (allows diagonal pixel connections)
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if (dx === 0 && dy === 0) continue;
                        const nx = cx + dx;
                        const ny = cy + dy;
                        if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                            const nIdx = ny * w + nx;
                            if (!visited[nIdx] && isOpaque(nx, ny)) {
                                visited[nIdx] = 1;
                                queue.push(nIdx);
                            }
                        }
                    }
                }
            }

            const bw = maxX - minX + 1;
            const bh = maxY - minY + 1;

            // Reject noise speckles smaller than 20 pixels
            if (pixelCount >= 20 && bw * bh >= 100) {
                boxes.push({ x: minX, y: minY, w: bw, h: bh });
            }
        }
    }

    // 8px Box Proximity Merge Pass:
    // Merges bounding boxes if their edge-to-edge gap is <= gapThreshold (8px),
    // bridging cracks, broken arches, and floating particles into a single material piece.
    const gapThreshold = 8;
    let merged = true;
    while (merged) {
        merged = false;
        for (let i = 0; i < boxes.length; i++) {
            for (let j = i + 1; j < boxes.length; j++) {
                const a = boxes[i];
                const b = boxes[j];

                // Calculate edge-to-edge gap distance on X and Y axes
                const gapX = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w));
                const gapY = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h));

                // If boxes are within gapThreshold (8px) on both X and Y
                if (gapX <= gapThreshold && gapY <= gapThreshold) {
                    // Merge box B into box A
                    const minX = Math.min(a.x, b.x);
                    const minY = Math.min(a.y, b.y);
                    const maxX = Math.max(a.x + a.w, b.x + b.w);
                    const maxY = Math.max(a.y + a.h, b.y + b.h);

                    boxes[i] = {
                        x: minX,
                        y: minY,
                        w: maxX - minX,
                        h: maxY - minY,
                    };

                    boxes.splice(j, 1);
                    merged = true;
                    break;
                }
            }
            if (merged) break;
        }
    }

    // Sort boxes from top to bottom, then left to right
    boxes.sort((a, b) => {
        const rowDiff = Math.floor(a.y / 64) - Math.floor(b.y / 64);
        if (rowDiff !== 0) return rowDiff;
        return a.x - b.x;
    });

    return boxes;
}

/**
 * Clean Pixel-Art Downsampler.
 * Uses center-pixel nearest neighbor sampling for 100% accurate colors (protecting skin tones)
 * without forcing artificial dark borders, eliminating speckle noise.
 */
export function downsample(src: PNG, targetW: number, targetH: number): PNG {
    const out = new PNG({ width: targetW, height: targetH });
    out.data.fill(0);
    const sx = src.width / targetW;
    const sy = src.height / targetH;

    for (let ty = 0; ty < targetH; ty++) {
        for (let tx = 0; tx < targetW; tx++) {
            // Find center of sampling region in high-res source
            const centerX = Math.floor((tx + 0.5) * sx);
            const centerY = Math.floor((ty + 0.5) * sy);

            const i = (src.width * centerY + centerX) << 2;
            const sa = src.data[i + 3];

            if (sa > 50) {
                const oi = (targetW * ty + tx) << 2;
                out.data[oi] = src.data[i];
                out.data[oi + 1] = src.data[i + 1];
                out.data[oi + 2] = src.data[i + 2];
                out.data[oi + 3] = 255;
            }
        }
    }
    return out;
}

/**
 * Professional Image-Q Quantizer with optional Floyd-Steinberg Dithering.
 * Uses NeuQuant neural-network color quantization + CIEDE2000/BT709 distance matching.
 */
export function quantize(png: PNG, nColors: number, useDither = false): void {
    const pointContainer = iq.utils.PointContainer.fromUint8Array(
        new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.byteLength),
        png.width,
        png.height,
    );

    const distanceCalculator = new iq.distance.EuclideanBT709();
    const paletteQuantizer = new iq.palette.NeuQuant(distanceCalculator, nColors);

    paletteQuantizer.sample(pointContainer);
    const palette = paletteQuantizer.quantizeSync();

    // Map image pixels to quantized palette: use ErrorDiffusion (Floyd-Steinberg) or NearestColor
    const imageQuantizer = useDither
        ? new iq.image.ErrorDiffusionArray(
              distanceCalculator,
              iq.image.ErrorDiffusionArrayKernel.FloydSteinberg,
              true,
          )
        : new iq.image.NearestColor(distanceCalculator);

    const resultContainer = imageQuantizer.quantizeSync(pointContainer, palette);
    const outData = resultContainer.toUint8Array();

    for (let i = 0; i < png.data.length; i += 4) {
        if (png.data[i + 3] === 0) continue;
        png.data[i] = outData[i];
        png.data[i + 1] = outData[i + 1];
        png.data[i + 2] = outData[i + 2];
        png.data[i + 3] = outData[i + 3];
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
            'usage: tsx scripts/split-sheet.ts <sheet.png> <outDir> [--pad=2] [--outline=2]\n' +
                '                                       [--downsample[=N]] [--colors[=N]] [--dither] [--rows=N --cols=M] [--no-recompose]\n' +
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
    const outlineWidth = Number(flags.find((f) => f.startsWith('--outline='))?.slice(10) ?? 2);
    const outlineColorArg =
        flags.find((f) => f.startsWith('--outline-color='))?.slice(16) ?? 'transparent';

    let outlineColor: [number, number, number] | 'transparent' = 'transparent';
    if (outlineColorArg !== 'transparent') {
        const parsed = colord(outlineColorArg);
        if (parsed.isValid()) {
            const rgb = parsed.toRgb();
            outlineColor = [rgb.r, rgb.g, rgb.b];
        }
    }

    // `--downsample[=N]` reduces sheet physical resolution by N (default 4).
    // `--colors[=N]` performs image-q NeuQuant palette quantization (default 32 colors).
    const downsampleArg = flags.find((f) => f === '--downsample' || f.startsWith('--downsample='));
    const doDownsample = !!downsampleArg;
    const downsampleScale =
        downsampleArg && downsampleArg.includes('=')
            ? Number(downsampleArg.slice('--downsample='.length))
            : 4;

    const colorsArg = flags.find((f) => f === '--colors' || f.startsWith('--colors='));
    const doQuantize = !!colorsArg;
    const colors =
        colorsArg && colorsArg.includes('=') ? Number(colorsArg.slice('--colors='.length)) : 32;

    const dither = flags.includes('--dither');
    const inPlace = flags.includes('--in-place');

    const png = PNG.sync.read(readFileSync(src));
    keyOut(png, { outlineWidth, outlineColor });

    let workPng: PNG = png;
    if (doDownsample) {
        if (!Number.isFinite(downsampleScale) || downsampleScale < 2) {
            throw new Error(
                `--downsample requires scale >= 2 (sheet is downsampled by this factor)`,
            );
        }
        const smallerW = Math.max(1, Math.floor(png.width / downsampleScale));
        const smallerH = Math.max(1, Math.floor(png.height / downsampleScale));
        workPng = downsample(png, smallerW, smallerH);
    }

    if (doQuantize) {
        quantize(workPng, colors, dither);
    }

    // Area threshold scales as 1/scale² when downsampled
    const minArea = doDownsample
        ? Math.max(100, Math.floor(2000 / (downsampleScale * downsampleScale)))
        : 2000;
    const frames = findFrames(workPng, 8, minArea);

    mkdirSync(outDir, { recursive: true });
    const isAppend = flags.includes('--append');
    const useHash = flags.includes('--hash');
    let startIndex = 0;
    if (!isAppend) {
        // wipe old frame-*.png so a re-run with different tuning can't leave stale frames behind.
        for (const f of readdirSync(outDir)) {
            if (/^(frame-\d+|hash-[a-f0-9]+)\.png$/.test(f)) rmSync(join(outDir, f));
        }
    } else {
        // Find highest existing frame index
        for (const f of readdirSync(outDir)) {
            const m = f.match(/^frame-(\d+)\.png$/);
            if (m) {
                const idx = parseInt(m[1], 10);
                if (idx >= startIndex) startIndex = idx + 1;
            }
        }
    }

    frames.forEach((box, i) => {
        const frame = crop(workPng, box, pad);
        const frameBuffer = new Uint8Array(PNG.sync.write(frame));

        let name: string;
        if (useHash) {
            const sha = createHash('sha256').update(frameBuffer).digest('hex');
            // First 8 chars + Last 4 chars (12 chars hash filename)
            const hashId = `${sha.slice(0, 8)}${sha.slice(-4)}`;
            name = `hash-${hashId}.png`;
        } else {
            const frameIndex = startIndex + i;
            name = `frame-${String(frameIndex).padStart(2, '0')}.png`;
        }

        writeFileSync(join(outDir, name), frameBuffer);
        console.log(`${name}  ${frame.width}x${frame.height}  @ ${box.x},${box.y}`);
    });
    console.log(`\n${frames.length} frames → ${outDir}`);
    if (doDownsample) {
        console.log(
            `  downsample: sheet → ${workPng.width}x${workPng.height} (scale ${downsampleScale})`,
        );
    }
    if (doQuantize) {
        console.log(
            `  quantize: palette reduced to ${colors} colors (image-q NeuQuant${dither ? ' + dither' : ''})`,
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

        // --in-place: copy source to raws/<id>.png and processed to
        // <id>.png under the caller's `outDir`. Requires --id=<id>.
        // The caller picks `outDir` (e.g. characters/, monsters/, drops/)
        // so the script doesn't bake the asset folder into the tool.
        if (inPlace) {
            const id = flags.find((f) => f.startsWith('--id='))?.slice(5);
            if (!id) {
                throw new Error('--in-place requires --id=<id>');
            }
            const processedPath = join(outDir, `${id}.png`);
            const rawsPath = join(outDir, 'raws', `${id}.png`);
            mkdirSync(dirname(rawsPath), { recursive: true });
            copyFileSync(src, rawsPath);
            copyFileSync(outFile, processedPath);
            // --in-place consumers expect a clean asset folder: frame-*
            // and recomposed.png are intermediate artifacts that don't
            // ship. Wipe them so the asset directory only holds the
            // final PNG + raws/.
            for (const f of readdirSync(outDir)) {
                if (/^(frame-\d+|hash-[a-f0-9]+)\.png$/.test(f)) rmSync(join(outDir, f));
            }
            const recomposed = join(outDir, 'recomposed.png');
            try {
                rmSync(recomposed, { force: true });
            } catch {
                // may not exist (--no-recompose); ignore
            }
            console.log(`in-place: ${id}.png ← raws/${id}.png (source archived)`);
        }
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
    // original file. Cell size is `sheet.width / cols` either way —
    // rounded down to an even value so each cell's centre is a clean
    // integer, eliminating sub-pixel jitter when a frame is centred
    // in a cell of fractional size.
    const sheet = sourcePng ?? PNG.sync.read(readFileSync(origPath));
    const cw = Math.floor(sheet.width / cols) & ~1;
    const ch = Math.floor(sheet.height / rows) & ~1;
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
        // floor (not round) — every frame centres the same way, so the
        // 0.5px rounding noise that bothered a 75×121 frame in a 128×128
        // cell doesn't shift it left or right arbitrarily.
        const startX = Math.floor(cx - frame.width / 2);
        const startY = Math.floor(cy - frame.height / 2);
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
    writeFileSync(outFile, new Uint8Array(PNG.sync.write(canvas)));
    console.log(`recomposed ${names.length} frames in ${rows}x${cols} grid → ${outFile}`);
}

if (process.argv[1]?.endsWith('split-sheet.ts')) main();
