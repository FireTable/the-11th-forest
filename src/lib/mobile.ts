/**
 * src/lib/mobile.ts
 * --------------------------------------------------------------------------
 * Mobile detection helpers and a one-shot orientation locker.
 *
 * The game is top-down + landscape-only. On portrait phones the Phaser
 * canvas letterboxes heavily, so we:
 *
 *   1. Best-effort lock to `landscape` via `screen.orientation.lock`
 *      (requires a user gesture on iOS Safari — we call it on first
 *      pointerdown). Silent no-op on unsupported browsers.
 *   2. Show a "rotate your phone" overlay whenever the viewport is
 *      portrait AND the device looks touch-capable. The overlay is
 *      intentionally CSS-only — JS only adds `display:none` once the
 *      viewport flips to landscape so the first paint isn't blank.
 *
 * `isMobileLike()` is the single gate for touch-only UI (joystick,
 * shoot + dodge buttons). Laptops with touchscreens get them too,
 * which is fine — the inputs are additive, never destructive.
 */

/** True when the user agent + viewport look like a phone/tablet. */
export function isMobileLike(): boolean {
    if (typeof window === 'undefined') return false;
    // Coarse UA gate — finer check is the (pointer: coarse) media query.
    const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
    const narrowViewport = window.innerWidth < 900;
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    return coarsePointer && (narrowViewport || hasTouch);
}

/** True when the viewport is currently portrait-shaped. */
export function isPortraitViewport(): boolean {
    if (typeof window === 'undefined') return false;
    return window.innerHeight > window.innerWidth;
}

/**
 * Best-effort landscape lock. Must be called from a user gesture
 * handler or the browser refuses. We don't await the promise — the
 * failure mode is "user sees rotate overlay", not a crash.
 */
export function requestLandscapeLock(): void {
    if (typeof screen === 'undefined') return;
    const orientation = (screen as Screen & {
        orientation?: { lock?: (o: 'landscape' | 'portrait') => Promise<void> };
    }).orientation;
    if (!orientation?.lock) return;
    orientation.lock('landscape').catch(() => {
        // ponytail: silent fail — the rotate overlay covers the gap.
    });
}
