import { BOOT_LOADING } from '@/lib/constants';
import {
    ART_W,
    ART_H,
    capDpr,
    effectScale,
    fitTextureSize,
    isLowEnd,
    smoothTowards,
    stageBox,
    stageFit,
    shouldUseStaticFallback,
    textureUploadScale,
    LOADING_ASSET_BASE,
    LOADING_ASSETS,
} from '@/lib/boot-loading/layout';
import {
    createForestGL,
    type ForestGL,
    type ForestImages,
    type LayerName,
} from '@/lib/boot-loading/gl';
import { mountRunner } from '@/lib/boot-loading/runner';

const ASSET_ORDER = ['bg', 'chars', 'fg', 'title', 'maskBg', 'maskDepth', 'maskChars'] as const;
const LAYER_ORDER: LayerName[] = ['bg', 'chars', 'fg', 'title'];
const RESIZE_DEBOUNCE_MS = 150;
/** Longest step the mouse smoothing will take, so returning from a hidden tab does not snap. */
const MAX_FRAME_DT = 0.1;

function loadImage(name: string): Promise<HTMLImageElement> {
    const img = new Image();
    img.decoding = 'async';
    img.src = LOADING_ASSET_BASE + name;
    return img.decode().then(() => img);
}

/**
 * The stage box of the splash: the CONTENT box of `#boot` (safe-area padding excluded), plus the
 * offset of its top-left from the padding box that absolutely positioned children resolve against.
 * Both the static `<img>` and the WebGL canvas are placed in this box, so the two can never
 * disagree about where the art lands — or about how big the canvas box is.
 */
function stageSize(boot: HTMLElement): { w: number; h: number; left: number; top: number } {
    // Layout size, not getBoundingClientRect: on portrait phones #boot is CSS-rotated into
    // landscape (index.html), and the rotated bounding box would swap width and height.
    const r = { width: boot.offsetWidth, height: boot.offsetHeight };
    const cs = getComputedStyle(boot);
    const pad = {
        top: parseFloat(cs.paddingTop) || 0,
        right: parseFloat(cs.paddingRight) || 0,
        bottom: parseFloat(cs.paddingBottom) || 0,
        left: parseFloat(cs.paddingLeft) || 0,
    };
    return { ...stageBox(r.width, r.height, pad), left: pad.left, top: pad.top };
}

/** Intrinsic size of a texture source — an `<img>`, or an already-downscaled 2D canvas. */
function sourceSize(src: TexImageSource): { w: number; h: number } {
    const s = src as {
        naturalWidth?: number;
        naturalHeight?: number;
        width?: number;
        height?: number;
    };
    return { w: s.naturalWidth || s.width || 0, h: s.naturalHeight || s.height || 0 };
}

/**
 * A layer shrunk to fit the GPU's MAX_TEXTURE_SIZE. This has to happen BEFORE the first upload —
 * `createForestGL` uploads whatever it is handed, and a texture above the limit fails to render
 * (or silently clamps), which no later resize would undo.
 */
function withinMaxTextureSize(img: HTMLImageElement, maxTextureSize: number): TexImageSource {
    const want = fitTextureSize(img.naturalWidth, img.naturalHeight, 1, maxTextureSize);
    if (want.scale >= 0.999) return img;
    const c = document.createElement('canvas');
    c.width = want.w;
    c.height = want.h;
    const ctx = c.getContext('2d');
    if (!ctx) return img;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, want.w, want.h);
    return c;
}

/**
 * Pin the static `<img>` to the art rect the shader will use, so the no-WebGL fallback and the
 * animated frame always agree. This is `object-fit: cover` with a focal point: the box is always
 * at least as big as the stage, so no side of the viewport is ever left as an empty band.
 */
function placeArt(
    art: HTMLElement,
    box: { left: number; top: number },
    fit: ReturnType<typeof stageFit>,
): void {
    art.style.inset = 'auto';
    art.style.left = `${box.left + fit.ox}px`;
    art.style.top = `${box.top + fit.oy}px`;
    art.style.width = `${ART_W * fit.s}px`;
    art.style.height = `${ART_H * fit.s}px`;
}

export async function startBootLoading(): Promise<void> {
    const boot = document.getElementById('boot');
    const art = document.getElementById('boot-art');
    if (!boot || !art) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const lowEnd = isLowEnd({
        hardwareConcurrency: navigator.hardwareConcurrency,
        deviceMemory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
    });
    const coarsePointer = window.matchMedia('(pointer: coarse)').matches;

    // The runner walks on every path, including the static one below, so it is mounted before the
    // WebGL decision. It looks after itself from here (it stops when the splash is removed).
    mountRunner(document);

    // Fit the static art immediately, before anything async: the splash must already be in its
    // final layout on the first painted frame, or it visibly jumps once the layers decode.
    const applyFit = (): {
        box: { w: number; h: number; left: number; top: number };
        fit: ReturnType<typeof stageFit>;
    } => {
        const box = stageSize(boot);
        const fit = stageFit(box.w, box.h);
        placeArt(art, box, fit);
        return { box, fit };
    };
    applyFit();
    // The web font landing changes the panel height, which can change dvh on mobile.
    void document.fonts?.ready.then(applyFit);

    // Re-fit listeners, registered BEFORE the fallback gate so both paths get them: the cover fit
    // is a pure function of the stage box, so a static splash that never re-fits is exactly how a
    // rotated phone grows empty bands along an edge. `refit` is `applyFit` on the static path and
    // the full resize (canvas box + backing store + textures) once WebGL is up.
    let resizeTimer = 0;
    let refit: () => void = applyFit;
    const onResize = (): void => {
        clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(refit, RESIZE_DEBOUNCE_MS);
    };
    const onOrientation = (): void => {
        clearTimeout(resizeTimer);
        // Rotation settles a beat after the event fires.
        resizeTimer = window.setTimeout(refit, RESIZE_DEBOUNCE_MS * 2);
    };
    const vv = window.visualViewport;
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onOrientation);
    if (vv) vv.addEventListener('resize', onResize);
    const removeFitListeners = (): void => {
        clearTimeout(resizeTimer);
        resizeTimer = 0;
        window.removeEventListener('resize', onResize);
        window.removeEventListener('orientationchange', onOrientation);
        if (vv) vv.removeEventListener('resize', onResize);
    };

    // Static path first: disabled, reduced motion or a device too weak to be worth it. Decided
    // BEFORE any context is created, so the static splash never leaks a WebGL context.
    // The art has already been re-fitted above, so a phone still never crops the characters.
    if (
        shouldUseStaticFallback({
            enabled: BOOT_LOADING.ENABLED,
            hasWebGL: true,
            reducedMotion,
            lowEnd,
        })
    ) {
        // Nothing below will ever run on this path, so the listeners are torn down here: when the
        // splash is removed the window listeners would otherwise live on until the next reload.
        const gone = new MutationObserver(() => {
            if (!boot.isConnected) {
                removeFitListeners();
                gone.disconnect();
            }
        });
        gone.observe(document.body, { childList: true });
        return;
    }

    const canvas = document.createElement('canvas');
    canvas.className = 'forest-gl';
    canvas.setAttribute('aria-hidden', 'true');

    const gl = canvas.getContext('webgl', {
        alpha: false,
        antialias: false,
        premultipliedAlpha: true,
        powerPreference: 'low-power',
        preserveDrawingBuffer: false,
    });
    if (!gl) return;

    let disposed = false;
    let raf = 0;
    let doneTimer = 0;
    const cleanups: Array<() => void> = [removeFitListeners];

    /**
     * Hand the context back. Every exit that happens AFTER `getContext` has to go through here —
     * the canvas is never inserted on those paths, so `dispose()` has nothing to remove and would
     * leave the context alive. Best-effort: the context may already be gone (it is, when this runs
     * from the webglcontextlost handler).
     */
    const releaseContext = (): void => {
        try {
            if (!gl.isContextLost()) gl.getExtension('WEBGL_lose_context')?.loseContext();
        } catch {
            // Losing a context that is already gone must never take the splash down with it.
        }
    };

    const dispose = (): void => {
        if (disposed) return;
        disposed = true;
        cancelAnimationFrame(raf);
        clearTimeout(resizeTimer);
        clearTimeout(doneTimer);
        for (const off of cleanups) off();
        // Drop the canvas FIRST: whatever else happens, the static #boot-art is what stays on
        // screen.
        canvas.remove();
        releaseContext();
    };

    try {
        const loaded = await Promise.all(ASSET_ORDER.map((n) => loadImage(LOADING_ASSETS[n])));
        const images: ForestImages = {
            bg: loaded[0],
            chars: loaded[1],
            fg: loaded[2],
            title: loaded[3],
            maskBg: loaded[4],
            maskDepth: loaded[5],
            maskChars: loaded[6],
        };

        // The game may already be up while the textures download.
        if (!boot.isConnected || boot.classList.contains('boot-done')) {
            releaseContext();
            return;
        }

        // Read the GPU limit BEFORE anything is uploaded: the layers handed to createForestGL are
        // the first texImage2D calls, so they are the ones that must already be within the limit.
        const maxTex = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 4096;
        const layers = {} as Record<LayerName, TexImageSource>;
        for (const n of LAYER_ORDER)
            layers[n] = withinMaxTextureSize(images[n] as HTMLImageElement, maxTex);

        let created: ForestGL;
        try {
            created = createForestGL(gl, { ...images, ...layers }, effectScale(coarsePointer));
        } catch (e) {
            console.warn('[boot-loading]', e);
            // The shaders never took: without this the context stays alive with nothing driving it.
            releaseContext();
            return;
        }
        const fgl = created;

        art.insertAdjacentElement('afterend', canvas);

        /** Uploaded texture scale per layer, so growing the window restores the originals. */
        const uploaded: Record<LayerName, number> = { bg: 1, chars: 1, fg: 1, title: 1 };

        const uploadIfChanged = (name: LayerName, deviceScale: number): void => {
            const src = layers[name];
            const nat = sourceSize(src);
            const want = fitTextureSize(nat.w, nat.h, textureUploadScale(deviceScale), maxTex);
            if (Math.abs(uploaded[name] - want.scale) < 0.001) return;
            if (want.scale >= 0.999) {
                fgl.upload(name, src);
                // Recorded only once the upload actually happened: a downscale that bails out must
                // not mark the layer as done, or it would never be retried.
                uploaded[name] = want.scale;
                return;
            }
            const c = document.createElement('canvas');
            c.width = want.w;
            c.height = want.h;
            const ctx = c.getContext('2d');
            if (!ctx) return;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(src as CanvasImageSource, 0, 0, want.w, want.h);
            fgl.upload(name, c);
            uploaded[name] = want.scale;
        };

        const resize = (): void => {
            if (disposed) return;
            const { box, fit } = applyFit();

            // The canvas CSS box IS the stage box, so the backing store below can use the same
            // numbers: one box for the img, the CSS box and uFit means no stretch.
            canvas.style.inset = 'auto';
            canvas.style.left = `${box.left}px`;
            canvas.style.top = `${box.top}px`;
            canvas.style.width = `${box.w}px`;
            canvas.style.height = `${box.h}px`;

            const dpr = capDpr(window.devicePixelRatio, BOOT_LOADING.MAX_DPR, coarsePointer);
            const w = Math.max(1, Math.round(box.w * dpr));
            const h = Math.max(1, Math.round(box.h * dpr));
            if (canvas.width !== w) canvas.width = w;
            if (canvas.height !== h) canvas.height = h;
            // The canvas CSS box is the stage box (set above), so the art's own offset travels in
            // uFit — exactly what the <img> gets from placeArt().
            fgl.resize(w, h, fit.ox * dpr, fit.oy * dpr, fit.s * dpr);

            const deviceScale = fit.s * dpr;
            for (const n of LAYER_ORDER) uploadIfChanged(n, deviceScale);
        };

        // The listeners registered before the fallback gate now drive the full resize, which is a
        // superset of applyFit: it also moves the canvas box and re-uploads textures.
        refit = resize;
        resize();

        const t0 = performance.now();
        let visibleAt = 0;
        let frames = 0;
        let last = 0;
        let mx = 0;
        let my = 0;
        /** When `#boot` got `boot-done`: the 100 % moment the arch glow eases into. */
        let doneAt = 0;

        // Mouse parallax only where a mouse exists: on a touch screen the target stays centred.
        let tx = 0;
        let ty = 0;
        if (window.matchMedia('(pointer: fine)').matches) {
            const onPointerMove = (e: PointerEvent): void => {
                tx = (e.clientX / window.innerWidth) * 2 - 1;
                ty = (e.clientY / window.innerHeight) * 2 - 1;
            };
            window.addEventListener('pointermove', onPointerMove, { passive: true });
            cleanups.push(() => window.removeEventListener('pointermove', onPointerMove));
        }

        const frame = (now: number): void => {
            raf = requestAnimationFrame(frame);
            const k = visibleAt ? Math.min(1, (now - visibleAt) / BOOT_LOADING.RAMP_MS) : 0;
            const t = (now - t0) / 1000;
            const dt = last ? Math.min(MAX_FRAME_DT, (now - last) / 1000) : 0;
            last = now;
            mx = smoothTowards(mx, tx, dt, BOOT_LOADING.MOUSE_RATE);
            my = smoothTowards(my, ty, dt, BOOT_LOADING.MOUSE_RATE);
            fgl.draw(t, k, {
                mx,
                my,
                done: doneAt ? Math.min(1, (now - doneAt) / BOOT_LOADING.ARCH_GLOW_MS) : 0,
            });
            frames++;
            if (frames === 3 && !visibleAt) {
                canvas.style.opacity = '1';
                visibleAt = now;
            }
        };
        raf = requestAnimationFrame(frame);

        const onVisibility = (): void => {
            if (document.hidden) {
                cancelAnimationFrame(raf);
                raf = 0;
            } else if (!disposed && !raf) {
                raf = requestAnimationFrame(frame);
            }
        };
        document.addEventListener('visibilitychange', onVisibility);
        cleanups.push(() => document.removeEventListener('visibilitychange', onVisibility));

        const onLost = (e: Event): void => {
            e.preventDefault();
            dispose();
        };
        canvas.addEventListener('webglcontextlost', onLost);
        cleanups.push(() => canvas.removeEventListener('webglcontextlost', onLost));

        const classWatcher = new MutationObserver(() => {
            if (boot.classList.contains('boot-done')) {
                // Keep drawing through the CSS fade, then drop the context.
                doneAt = performance.now();
                doneTimer = window.setTimeout(dispose, 450);
                classWatcher.disconnect();
            }
        });
        classWatcher.observe(boot, { attributes: true, attributeFilter: ['class'] });
        cleanups.push(() => classWatcher.disconnect());

        const bodyWatcher = new MutationObserver(() => {
            if (!boot.isConnected) dispose();
        });
        bodyWatcher.observe(document.body, { childList: true });
        cleanups.push(() => bodyWatcher.disconnect());
    } catch (e) {
        console.warn('[boot-loading]', e);
        dispose();
    }
}
