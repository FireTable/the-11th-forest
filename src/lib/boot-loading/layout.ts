/** Key-art space. Every rect below is in art pixels (origin top-left). */
export const ART_W = 1920;
export const ART_H = 1072;

export type Rect = { x: number; y: number; w: number; h: number };

export const LAYER_RECT = {
    bg: { x: 0, y: 0, w: 1920, h: 1072 },
    chars: { x: 487, y: 481, w: 970, h: 495 },
    fg: { x: 0, y: 739, w: 1920, h: 333 },
    title: { x: 618, y: 100, w: 688, h: 269 }, // 0.85× of the 809×317 asset, same centre x, raised
} as const satisfies Record<string, Rect>;

export const LOADING_ASSET_BASE = '/assets/image/ui/loading/';
export const LOADING_ASSETS = {
    key: 'forest-loading-key.webp',
    bg: 'forest-loading-bg.webp',
    chars: 'forest-loading-chars.webp',
    fg: 'forest-loading-fg.webp',
    title: 'forest-loading-title.webp',
    maskBg: 'forest-loading-mask-bg.webp',
    maskDepth: 'forest-loading-mask-depth.webp',
    maskChars: 'forest-loading-mask-chars.webp',
} as const;

/** Where the art lands in a box: its (0,0) relative to the box, and CSS px per art px. */
export type Fit = { ox: number; oy: number; s: number };

/**
 * Same math as CSS `object-fit: cover; object-position: 50% 50%`: where the art's (0,0) lands
 * inside the box, and the scale (CSS px per art px).
 *
 * This is the single source of truth for the splash layout. The stylesheet runs it on #boot-art,
 * and start.ts runs the same arithmetic on the box the browser produced — so the static <img> and
 * the WebGL canvas cannot disagree about where the art is.
 */
export function coverFit(viewW: number, viewH: number): { ox: number; oy: number; s: number } {
    const s = Math.max(viewW / ART_W, viewH / ART_H);
    return { ox: (viewW - ART_W * s) / 2, oy: (viewH - ART_H * s) / 2, s };
}

/**
 * Canvas backing store for a CSS box at `dpr`, and the scale each axis actually ended up with.
 * Rounding the backing store is unavoidable, so the two axes rarely come out at exactly `dpr` —
 * the caller has to place the art with sx/sy, never with the raw dpr, or the canvas and the
 * `<img>` disagree by the rounding error multiplied by the distance from the origin.
 */
export function backingSize(
    box: { w: number; h: number },
    dpr: number,
): { w: number; h: number; sx: number; sy: number } {
    const d = dpr > 0 && Number.isFinite(dpr) ? dpr : 1;
    const bw = Math.max(1, box.w);
    const bh = Math.max(1, box.h);
    const w = Math.max(1, Math.round(bw * d));
    const h = Math.max(1, Math.round(bh * d));
    return { w, h, sx: w / bw, sy: h / bh };
}

/** Content (padding) box of the splash container — the stage the art is fitted into. */
export function stageBox(
    w: number,
    h: number,
    pad: { top: number; right: number; bottom: number; left: number },
): { w: number; h: number } {
    return { w: Math.max(1, w - pad.left - pad.right), h: Math.max(1, h - pad.top - pad.bottom) };
}

/** Mobile GPUs stop at 2; never render a splash at more than 2 device px per CSS px on a phone. */
export const MOBILE_DPR_CAP = 2;

/** Backing-store DPR for the canvas: capped, never below 1, never upscaling past the cap. */
export function capDpr(raw: number, maxDpr: number, coarsePointer: boolean): number {
    const limit = coarsePointer ? Math.min(maxDpr, MOBILE_DPR_CAP) : maxDpr;
    const r = Number.isFinite(raw) && raw > 0 ? raw : 1;
    return Math.min(r, limit, Math.max(limit, 1));
}

/** Weak hardware: fall back to the static splash rather than risk jank on a 4-layer shader. */
export function isLowEnd(opts: { hardwareConcurrency?: number; deviceMemory?: number }): boolean {
    const cores = opts.hardwareConcurrency;
    if (typeof cores === 'number' && Number.isFinite(cores) && cores <= 2) return true;
    const mem = opts.deviceMemory;
    return typeof mem === 'number' && Number.isFinite(mem) && mem <= 2;
}

/** Phones get the same effects, softer — a phone GPU pays for every fragment twice over. */
export const MOBILE_EFFECT_SCALE = 0.6;

/** Effect intensity multiplier for the shader uniforms (coarse pointer = phone / tablet). */
export function effectScale(coarsePointer: boolean): number {
    return coarsePointer ? MOBILE_EFFECT_SCALE : 1;
}

/**
 * Frame-rate independent exponential smoothing. `rate` is the smoothing speed in 1/s: the value
 * covers ~63 % of the remaining distance every 1/rate seconds, whatever the frame interval.
 */
export function smoothTowards(cur: number, target: number, dt: number, rate: number): number {
    return cur + (target - cur) * (1 - Math.exp(-Math.max(0, dt) * rate));
}

/**
 * Whether to keep showing the static `<img>` instead of running the animated splash. Extends the
 * `shouldAnimate` gate with the runtime reasons only it knows about. A lost context is not a
 * decision: it arrives as an event, and the canvas is dropped when it does.
 */
export function shouldUseStaticFallback(opts: {
    enabled: boolean;
    hasWebGL: boolean;
    reducedMotion: boolean;
    lowEnd: boolean;
}): boolean {
    const animate = shouldAnimate({
        enabled: opts.enabled,
        hasWebGL: opts.hasWebGL,
        reducedMotion: opts.reducedMotion,
    });
    return !animate || opts.lowEnd;
}

/**
 * Below this device-px-per-art-px scale the layers are pre-downscaled on the CPU: WebGL1 cannot
 * mipmap NPOT textures, so shrinking up front is the only way to stop the art from shimmering.
 * At or above it we upload the originals, so growing the window restores full detail.
 */
export const DOWNSCALE_AT = 0.75;

/** Texture scale to upload for an on-screen scale (1 = original pixels). */
export function textureUploadScale(cssScale: number): number {
    return cssScale < DOWNSCALE_AT ? cssScale : 1;
}

/** Texture size for a desired scale, clamped to the GPU's MAX_TEXTURE_SIZE. Never zero-sized. */
export function fitTextureSize(
    texW: number,
    texH: number,
    scale: number,
    maxTextureSize: number,
): { w: number; h: number; scale: number } {
    const limit = maxTextureSize > 0 ? Math.min(1, maxTextureSize / Math.max(texW, texH)) : 1;
    const s = Math.min(scale > 0 ? scale : 1, limit);
    return { w: Math.max(1, Math.round(texW * s)), h: Math.max(1, Math.round(texH * s)), scale: s };
}

/**
 * Master breath curve in [0, 1], period 2π / w seconds. Asymmetric like real breathing:
 * inhale 40 % (0.5 − 0.5·cos(π·x/0.4)), exhale 60 % (0.5 + 0.5·cos(π·(x−0.4)/0.6)). C1-smooth.
 * The GLSL `br()` in task 04 MUST be generated from the same `w` (see `breathGLSL`).
 */
export function breath(t: number, w: number): number {
    const x = ((((t * w) / (2 * Math.PI)) % 1) + 1) % 1;
    return x < 0.4
        ? 0.5 - 0.5 * Math.cos((Math.PI * x) / 0.4)
        : 0.5 + 0.5 * Math.cos((Math.PI * (x - 0.4)) / 0.6);
}

/** GLSL source of `float br(float t)` matching `breath(t, w)`. */
export function breathGLSL(w: number): string {
    return (
        'float br(float t){float x=fract(t*' +
        (w / (2 * Math.PI)).toFixed(6) +
        ');return x<.4?.5-.5*cos(7.853982*x):.5+.5*cos(5.235988*(x-.4));}'
    );
}

/** Whether the animated (WebGL) splash should run. Pure so it can be unit-tested. */
export function shouldAnimate(opts: {
    reducedMotion: boolean;
    hasWebGL: boolean;
    enabled: boolean;
}): boolean {
    return opts.enabled && opts.hasWebGL && !opts.reducedMotion;
}

/** Monotonic, clamped progress in [0, 1]. Returns the value to display. */
export function nextProgress(prev: number, incoming: number): number {
    const v = Number.isFinite(incoming) ? Math.min(1, Math.max(0, incoming)) : 0;
    return Math.max(prev, v);
}

/**
 * Map loader progress r∈[0,1] into [f0, cap] so the bar continues from where the fake CSS fill
 * already is instead of jumping backwards the moment real progress arrives. `cap` stays below 1
 * so only `boot-done` ever shows a full bar.
 */
export function mapRealProgress(f0: number, r: number, cap = 0.97): number {
    const a = Math.min(cap, Math.max(0, f0));
    // Non-finite r reads as 0: a NaN here would reach a CSS scaleX() and blank the fill.
    const rr = Number.isFinite(r) ? Math.min(1, Math.max(0, r)) : 0;
    return a + (cap - a) * rr;
}
