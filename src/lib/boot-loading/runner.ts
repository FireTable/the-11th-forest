import { BOOT_LOADING } from '@/lib/boot-loading/config';

/**
 * The runner that walks the progress bar: the chubby boy on the left of the key art, redrawn as
 * a 20×24 pixel sprite so it stays crisp at any CSS size (`image-rendering: pixelated` does the
 * nearest-neighbour upscale — the canvas backing store is always exactly one sprite, and CSS sizes
 * it in whole multiples of that in index.html).
 *
 * The walk is four frames on the SAME rhythm the characters breathe on: one full walk cycle takes
 * exactly one breath period, `2π / BOOT_LOADING.BREATH_W`. The belly jiggles at twice that rate —
 * it is widest on the two "down" (pass) frames, narrowest on the two contact frames.
 */

/** Sprite width, in pixels. Every row is exactly this long. */
export const RUNNER_W = 20;

/** Sprite height, in pixels. Every frame is exactly this tall. */
export const RUNNER_H = 24;

/** Frames the sprite switches through per breath. Four frames = one left-right stride. */
export const RUNNER_STEPS_PER_BREATH = 4;

/**
 * Every colour the sprite can use, keyed by the single character that stands for it in the row
 * strings below: a dark outline plus one shade level per material. `.` is transparent and
 * deliberately has no entry.
 */
export const RUNNER_PALETTE = {
    o: '#241a12', // outline — the dark rim that holds the figure together
    H: '#3a2a1d', // hair, messy dark brown
    h: '#54402f', // hair, the lit side of the mess
    S: '#f2c79c', // warm skin
    s: '#dba87c', // skin shade — the jaw and the navel
    G: '#141414', // glasses, black rims
    L: '#cfe6f2', // glasses, the lens itself
    T: '#f7f6f0', // tank top, white
    t: '#dcdbd1', // tank top, shaded where the arm meets it
    C: '#5b6b3d', // army-green cargo shorts
    c: '#455430', // cargo, the side pockets
    W: '#fbfbf8', // white sneakers
    x: '#b9b9b2', // their soles
} as const;

/** The character a sprite pixel is drawn with. */
export type PaletteKey = keyof typeof RUNNER_PALETTE;

/** Every character the row strings may contain: the palette plus `.` for transparent. */
export type PaletteChar = '.' | PaletteKey;

/** One frame: a grid of palette characters, plus how far it is bobbed up, in pixels. */
export type RunnerFrame = { rows: string[]; bob: number };

const FRAME_CONTACT_L: RunnerFrame = {
    bob: 0,
    rows: [
        '....................', //  0  empty margin, so the bob on the pass frames has room
        '.....o.o.o.o.o......', //  1  spiky tips of the mess
        '....oHHHHHHHHHHo....', //  2
        '....oHhhHHHHhhHo....', //  3
        '...oHHHHHHHHHHHHo...', //  4  the head: wide and low, deliberately more than half the sprite
        '...oHhhHHHHHHHHho...', //  5
        '...oSSSSSSSSSSsSo...', //  6  forehead
        '...oSGGGGGGGGGGSo...', //  7  top rims
        '...oSGLLLGGLLLGSo...', //  8  two lenses, split by the bridge
        '...oSGGGGGGGGGGSo...', //  9  bottom rims
        '...oSSSSSooSSSSso...', // 10  cheeks, open mouth
        '....oSSSSSSSSSSo....', // 11  chin
        '....oTTTTTTTTTTo....', // 12  shoulders, tank top
        '..osoTtTTTTTTtToso..', // 13  chest: the tank top is cropped here
        '..osoSSSSSSSSSSoso..', // 14  bare round belly
        '..osoSSSSoSSSSSoo...', // 15  the navel
        '..ososSSSSSSSSso....', // 16  belly, shaded at the sides
        '...ooCCCCCCCCCCo....', // 17  army-green cargo shorts
        '....oCcCCCCCCcCo....', // 18  side pockets
        '....oCCo....oCCo....', // 19  legs
        '....oCCo....oCCo....', // 20
        '...oWWWo....oWWWo...', // 21  white sneakers
        '...oWWWo....oWWWo...', // 22
        '...oxxxo....oxxxo...', // 23  soles — the row he stands on
    ],
};

const FRAME_PASS_DOWN: RunnerFrame = {
    bob: 1,
    rows: [
        '....................',
        '.....o.o.o.o.o......',
        '....oHHHHHHHHHHo....',
        '....oHhhHHHHhhHo....',
        '...oHHHHHHHHHHHHo...',
        '...oHhhHHHHHHHHho...',
        '...oSSSSSSSSSSsSo...',
        '...oSGGGGGGGGGGSo...',
        '...oSGLLLGGLLLGSo...',
        '...oSGGGGGGGGGGSo...',
        '...oSSSSSooSSSSso...',
        '....oSSSSSSSSSSo....',
        '....oTTTTTTTTTTo....',
        '..osoTtTTTTTTtToso..',
        '..osoSSSSSSSSSSoso..', // 14  bare round belly
        '..osoSSSSoSSSSSoso..', // 15  the navel, pushed up by the swell
        '...oosSSSSSSSSsoo...', // 16
        '....oCCCCCCCCCCo....',
        '....oCcCCCCCCcCo....',
        '.....oCCo..oCCo.....', // 19  legs together, under him
        '.....oCCo..oCCo.....', // 20
        '....oWWWo..oWWWo....', // 21
        '....oWWWo..oWWWo....', // 22
        '....oxxxo..oxxxo....', // 23
    ],
};

const FRAME_CONTACT_R: RunnerFrame = {
    bob: 0,
    rows: [
        '....................',
        '.....o.o.o.o.o......',
        '....oHHHHHHHHHHo....',
        '....oHhhHHHHhhHo....',
        '...oHHHHHHHHHHHHo...',
        '...oHhhHHHHHHHHho...',
        '...oSSSSSSSSSSsSo...',
        '...oSGGGGGGGGGGSo...',
        '...oSGLLLGGLLLGSo...',
        '...oSGGGGGGGGGGSo...',
        '...oSSSSSooSSSSso...',
        '....oSSSSSSSSSSo....',
        '....oTTTTTTTTTTo....',
        '..osoTtTTTTTTtToso..',
        '..osoSSSSSSSSSSoso..',
        '...ooSSSSoSSSSSoso..',
        '....osSSSSSSSSsoso..',
        '....oCCCCCCCCCCoo...',
        '....oCcCCCCCCcCo....',
        '.....oCCo.oCCo......', // 19  the other foot forward
        '.....oCCo.oCCo......', // 20
        '....oWWWo.oWWWo.....', // 21
        '....oWWWo.oWWWo.....', // 22
        '....oxxxo.oxxxo.....', // 23
    ],
};

const FRAME_PASS_STAGGER: RunnerFrame = {
    bob: 1,
    rows: [
        '....................',
        '.....o.o.o.o.o......',
        '....oHHHHHHHHHHo....',
        '....oHhhHHHHhhHo....',
        '...oHHHHHHHHHHHHo...',
        '...oHhhHHHHHHHHho...',
        '...oSSSSSSSSSSsSo...',
        '...oSGGGGGGGGGGSo...',
        '...oSGLLLGGLLLGSo...',
        '...oSGGGGGGGGGGSo...',
        '...oSSSSSooSSSSso...',
        '....oSSSSSSSSSSo....',
        '....oTTTTTTTTTTo....',
        '..osoTtTTTTTTtToso..',
        '..osoSSSSSSSSSSoso..',
        '..osoSSSSoSSSSSoso..',
        '...oosSSSSSSSSsoo...',
        '....oCCCCCCCCCCo....',
        '....oCcCCCCCCcCo....',
        '....oCCo..oCCo......', // 19  legs scissored across each other
        '....oCCo..oCCo......', // 20
        '...oWWWo...oWWWo....', // 21
        '...oWWWo...oWWWo....', // 22
        '...oxxxo...oxxxo....', // 23
    ],
};

export const RUNNER_FRAMES: readonly RunnerFrame[] = [
    FRAME_CONTACT_L,
    FRAME_PASS_DOWN,
    FRAME_CONTACT_R,
    FRAME_PASS_STAGGER,
];

/** One opaque sprite pixel. */
export type RunnerPixel = { x: number; y: number; color: string; key: PaletteKey };

/** Index of a frame. */
export type RunnerFrameIndex = 0 | 1 | 2 | 3;

/**
 * Which walk frame belongs at time `t` (s). Locked to the breath: the frame advances
 * `RUNNER_STEPS_PER_BREATH` times per `2π / w`, so the stride is evenly spaced in time and one
 * full cycle lands exactly on one breath. The phase — not the breath VALUE — is what steps,
 * because the breath curve is flat at its peak and a value-quantised flip there is invisible.
 */
export function runnerFrameAt(t: number, w: number): RunnerFrameIndex {
    const phase = (((((t * w) / (2 * Math.PI)) % 1) + 1) % 1) * RUNNER_STEPS_PER_BREATH;
    return (Math.floor(phase) % RUNNER_FRAMES.length) as RunnerFrameIndex;
}

/** One breath in seconds — the runner's stride period. */
export function runnerStrideS(w: number): number {
    return (2 * Math.PI) / w / RUNNER_STEPS_PER_BREATH;
}

/** Flatten a frame into drawable pixels. Pure — the caller decides how to paint them. */
export function runnerPixels(frame: RunnerFrame): RunnerPixel[] {
    const out: RunnerPixel[] = [];
    frame.rows.forEach((row, y) => {
        for (let x = 0; x < RUNNER_W; x++) {
            const key = row[x] as PaletteChar;
            if (key === '.') continue;
            out.push({ x, y: y - frame.bob, color: RUNNER_PALETTE[key], key });
        }
    });
    return out;
}

/**
 * Paint one frame into a `RUNNER_W × RUNNER_H` 2D context, one `fillRect` per pixel. The context
 * is never scaled, so the backing store stays 1:1 with the sprite and the browser does the crisp
 * upscale. `bob` lifts the figure inside the canvas.
 */
export function drawRunnerFrame(ctx: CanvasRenderingContext2D, frame: RunnerFrame): void {
    ctx.clearRect(0, 0, RUNNER_W, RUNNER_H);
    for (const p of runnerPixels(frame)) {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, 1, 1);
    }
}

/**
 * Put the runner into `#boot` and animate it. Returns a disposer, or null when there is no
 * `.pixel-runner` in the document. Owns its own rAF (it has to run on the static-fallback path
 * too, where the WebGL loop never starts), pauses while the tab is hidden, and stops on its own
 * once the splash is removed.
 */
export function mountRunner(root: ParentNode): (() => void) | null {
    const el = root.querySelector('.pixel-runner');
    if (!(el instanceof HTMLElement)) return null;

    const canvas = document.createElement('canvas');
    canvas.width = RUNNER_W;
    canvas.height = RUNNER_H;
    canvas.className = 'runner-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    el.replaceChildren(canvas);

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    // The canvas is transparent, so the inline first-paint frame on .pixel-runner would show
    // through every other frame (and the bob). Drop it the moment the canvas can draw.
    el.style.backgroundImage = 'none';

    // Reduced motion: pose him, don't walk him. Same rule as the WebGL splash.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        drawRunnerFrame(ctx, RUNNER_FRAMES[0]);
        return null;
    }

    let raf = 0;
    let disposed = false;
    const t0 = performance.now();

    const frame = (now: number): void => {
        drawRunnerFrame(
            ctx,
            RUNNER_FRAMES[runnerFrameAt((now - t0) / 1000, BOOT_LOADING.BREATH_W)],
        );
        raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const dispose = (): void => {
        if (disposed) return;
        disposed = true;
        cancelAnimationFrame(raf);
        document.removeEventListener('visibilitychange', onVisibility);
        observer.disconnect();
    };

    const onVisibility = (): void => {
        if (document.hidden) {
            cancelAnimationFrame(raf);
            raf = 0;
        } else if (!disposed && !raf) {
            raf = requestAnimationFrame(frame);
        }
    };
    document.addEventListener('visibilitychange', onVisibility);

    // The splash removes itself on dismissal; nothing else will tell us.
    const observer = new MutationObserver(() => {
        if (!el.isConnected) dispose();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return dispose;
}
