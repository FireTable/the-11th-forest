import React, { useEffect, useRef, useState } from 'react';

import { EventBus } from '@/lib/events/bus';

/**
 * Native canvas size the aim logic emits coordinates in. Matches
 * `GameHUDLayer`'s `nativeW/H`. Mirrored here so this component is
 * self-sufficient (it sits at app-root level, not inside the scaled
 * HUD layer anymore, so its size is constant 34px regardless of
 * the canvas's CSS transform).
 */
const NATIVE_W = 1536;
const NATIVE_H = 864;

/** Map a native-canvas coord to a viewport-pixel coord via the canvas
 *  rect. Pure so the math is testable without a DOM. */
export function nativeToViewport(
    coord: number,
    nativeSize: number,
    canvasOffset: number,
    canvasSize: number,
): number {
    if (canvasSize <= 0) return -100;
    return canvasOffset + (coord / nativeSize) * canvasSize;
}

/**
 * Crosshair at the screen-space cursor (or aim-assist lock target).
 *
 * Render path deliberately bypasses React's render cycle for the
 * `left/top` style: every pointermove emits an `aim-crosshair-update`
 * (sometimes ~120 Hz on a high-end mouse). A setState per emit would
 * queue a render per move and trail the cursor by ~1 frame. We keep
 * `visible` + `isLocked` as React state (low frequency) and write
 * position directly to the DOM via a ref. Browser style mutations
 * are coalesced on the next paint so the crosshair tracks instantly.
 */
export const PixelCrosshair: React.FC = () => {
    const [mode, setMode] = useState<{ visible: boolean; isLocked: boolean }>({
        visible: false,
        isLocked: false,
    });
    const [rect, setRect] = useState<{ left: number; top: number; width: number; height: number } | null>(
        null,
    );
    const wrapRef = useRef<HTMLDivElement | null>(null);
    // Track the latest coords so visibility toggle-on uses the most
    // recent aim position rather than the stale default `-100, -100`.
    const lastCoordRef = useRef<{ x: number; y: number }>({ x: -100, y: -100 });

    useEffect(() => {
        const onAimUpdate = (data: { x: number; y: number; isLocked: boolean; visible: boolean }) => {
            lastCoordRef.current = { x: data.x, y: data.y };
            // Direct DOM write — no React render for the position change.
            const wrap = wrapRef.current;
            const r = rect;
            if (wrap && r && data.visible) {
                wrap.style.left = `${nativeToViewport(data.x, NATIVE_W, r.left, r.width)}px`;
                wrap.style.top = `${nativeToViewport(data.y, NATIVE_H, r.top, r.height)}px`;
            }
            setMode((prev) => {
                if (prev.visible === data.visible && prev.isLocked === data.isLocked) return prev;
                return { visible: data.visible, isLocked: data.isLocked };
            });
        };
        EventBus.on('aim-crosshair-update', onAimUpdate);
        return () => {
            EventBus.removeListener('aim-crosshair-update', onAimUpdate);
        };
    }, [rect]);

    // Track the canvas's bounding rect. Phaser game creation is async —
    // poll until `#game-container canvas` exists, then install the
    // ResizeObserver + window listeners. Without polling, the mount-time
    // querySelector returns null and `rect` stays null forever (and the
    // crosshair never renders).
    useEffect(() => {
        let ro: ResizeObserver | null = null;
        let canvas: HTMLCanvasElement | null = null;
        const update = (): void => {
            if (!canvas) return;
            const r = canvas.getBoundingClientRect();
            setRect({ left: r.left, top: r.top, width: r.width, height: r.height });
        };
        const install = (): void => {
            canvas = document.querySelector('#game-container canvas') as HTMLCanvasElement | null;
            if (!canvas) return;
            update();
            ro = new ResizeObserver(update);
            ro.observe(canvas);
            window.addEventListener('resize', update);
            window.visualViewport?.addEventListener('resize', update);
        };
        install();
        let ticks = 0;
        const poll = window.setInterval(() => {
            if (canvas) {
                window.clearInterval(poll);
                return;
            }
            ticks++;
            if (ticks > 30) {
                window.clearInterval(poll);
                return;
            }
            install();
        }, 16);
        return () => {
            window.clearInterval(poll);
            ro?.disconnect();
            window.removeEventListener('resize', update);
            window.visualViewport?.removeEventListener('resize', update);
        };
    }, []);

    if (!mode.visible) return null;

    const r = rect ?? { left: 0, top: 0, width: 0, height: 0 };
    const initialX = nativeToViewport(lastCoordRef.current.x, NATIVE_W, r.left, r.width);
    const initialY = nativeToViewport(lastCoordRef.current.y, NATIVE_H, r.top, r.height);

    return (
        <div
            ref={wrapRef}
            className="pointer-events-none fixed z-50 transform -translate-x-1/2 -translate-y-1/2 select-none"
            style={{ left: `${initialX}px`, top: `${initialY}px` }}
            data-testid="pixel-crosshair"
        >
            <div
                className={`transition-all duration-150 ease-out ${
                    mode.isLocked ? 'animate-crosshair-breathe' : 'scale-100'
                }`}
            >
                <svg
                    width={34}
                    height={34}
                    viewBox="0 0 32 32"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    style={{ imageRendering: 'pixelated', shapeRendering: 'crispEdges' }}
                    className="transition-all duration-150 ease-out"
                >
                    <path d="M 2 2 H 11 V 8 H 8 V 11 H 2 Z" fill="black" />
                    <path d="M 4 4 H 9 V 6 H 6 V 9 H 4 Z" fill="#ffffff" />
                    <path d="M 21 2 H 30 V 11 H 24 V 8 H 21 Z" fill="black" />
                    <path d="M 23 4 H 28 V 9 H 26 V 6 H 23 Z" fill="#ffffff" />
                    <path d="M 2 21 H 8 V 24 H 11 V 30 H 2 Z" fill="black" />
                    <path d="M 4 23 H 6 V 26 H 9 V 28 H 4 Z" fill="#ffffff" />
                    <path d="M 24 21 H 30 V 30 H 21 V 24 H 24 Z" fill="black" />
                    <path d="M 26 23 H 28 V 28 H 23 V 26 H 24 Z" fill="#ffffff" />
                    <rect x="13" y="13" width="6" height="6" fill="black" />
                    <rect x="14" y="14" width="4" height="4" fill="#ef4444" />
                </svg>
            </div>
        </div>
    );
};
