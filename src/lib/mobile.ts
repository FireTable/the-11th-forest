/**
 * src/lib/mobile.ts
 * --------------------------------------------------------------------------
 * Mobile detection + the coordinate math for forced landscape.
 *
 * The game is top-down + landscape-only. Rather than nagging the player
 * to rotate their phone, `#app` is rotated 90° by a CSS rule in
 * `src/index.css` (`@media (orientation: portrait) and (pointer: coarse)`)
 * so the game renders sideways on a portrait screen.
 *
 * That rotation introduces two coordinate spaces:
 *
 *   - **client space** — what `clientX/Y` and `getBoundingClientRect()`
 *     report; always the unrotated browser viewport.
 *   - **app space** — the rotated `#app` box everything is laid out in;
 *     `position: fixed/absolute` children resolve against it because a
 *     transformed ancestor becomes their containing block.
 *
 * `toAppPoint` / `toAppRect` convert client → app so pointer math and
 * DOM-positioned HUD chrome (crosshair, joystick) stay aligned. Both are
 * the identity when we're not rotated, so call sites need no branching.
 *
 * `isMobileLike()` is the single gate for touch-only UI (joystick,
 * shoot + dodge buttons). Laptops with touchscreens get them too,
 * which is fine — the inputs are additive, never destructive.
 */

export interface Rect {
    left: number;
    top: number;
    width: number;
    height: number;
}

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
 * True while `#app` is rendered rotated 90°. Mirrors the CSS media
 * query — keep the two in sync.
 */
export function isRotated(): boolean {
    return isMobileLike() && isPortraitViewport();
}

/** Viewport size in app space (width/height swap while rotated). */
export function appViewport(): { width: number; height: number } {
    if (typeof window === 'undefined') return { width: 0, height: 0 };
    return isRotated()
        ? { width: window.innerHeight, height: window.innerWidth }
        : { width: window.innerWidth, height: window.innerHeight };
}

/**
 * Client point → app point. The CSS is
 * `transform-origin: 0 0; transform: translateX(100dvw) rotate(90deg)`,
 * i.e. app (x, y) lands at client (innerWidth - y, x) — so the inverse
 * reads x from clientY and y from the mirrored clientX.
 */
export function toAppPoint(clientX: number, clientY: number): { x: number; y: number } {
    if (!isRotated()) return { x: clientX, y: clientY };
    return { x: clientY, y: window.innerWidth - clientX };
}

/** Client rect → app rect (same inverse transform, applied to a box). */
export function toAppRect(rect: Rect): Rect {
    if (!isRotated()) {
        return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    }
    return {
        left: rect.top,
        top: window.innerWidth - (rect.left + rect.width),
        width: rect.height,
        height: rect.width,
    };
}

/** `getBoundingClientRect()` in app space. */
export function appRect(el: Element): Rect {
    return toAppRect(el.getBoundingClientRect());
}
