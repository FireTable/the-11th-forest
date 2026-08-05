import React, { useEffect, useRef, useState } from 'react';

import { EventBus } from '@/lib/events/bus';
import { appRect } from '@/lib/mobile';

/**
 * Native canvas size the aim logic emits coordinates in.
 */
const NATIVE_W = 1536;
const NATIVE_H = 864;

/** Map a native-canvas coord to a viewport-pixel coord via the canvas rect. */
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
 * High-Performance Pixel Crosshair
 *
 * Performance optimization highlights:
 * 1. Zero React re-renders for position tracking: high-frequency aim
 *    coordinates bypass the State mechanism entirely.
 * 2. Frame-rate synchronization (rAF throttle): uses requestAnimationFrame
 *    to lock to the display refresh cycle, eliminating redundant DOM writes.
 * 3. GPU composite layer: translate3d replaces top/left for zero layout
 *    reflow.
 * 4. Permanently mounted DOM: visibility toggles replace conditional
 *    rendering (return null), eliminating DOM rebuilds and first-frame
 *    invalidation.
 * 5. Zero closure overhead: rect and visible live in refs; the EventBus
 *    listener mounts once globally.
 */
export const PixelCrosshair: React.FC = () => {
    // Only low-frequency UI state (lock / animation) stays in React State
    const [isLocked, setIsLocked] = useState(false);

    // DOM ref
    const wrapRef = useRef<HTMLDivElement | null>(null);

    // High-frequency / live refs (bypass React re-render)
    const rectRef = useRef<{ left: number; top: number; width: number; height: number } | null>(null);
    const lastCoordRef = useRef<{ x: number; y: number }>({ x: -100, y: -100 });
    const visibleRef = useRef(false);

    // Frame-synchronized scheduler (rAF)
    const rafIdRef = useRef<number | null>(null);

    // Helper: push coord updates to the DOM (GPU composite layer)
    const applyTransform = () => {
        const wrap = wrapRef.current;
        const r = rectRef.current;
        const pos = lastCoordRef.current;

        if (!wrap) return;

        // Visibility control
        wrap.style.visibility = visibleRef.current ? 'visible' : 'hidden';

        if (r && visibleRef.current) {
            const vx = nativeToViewport(pos.x, NATIVE_W, r.left, r.width);
            const vy = nativeToViewport(pos.y, NATIVE_H, r.top, r.height);
            // translate3d enables HW acceleration + translate(-50%, -50%)
            // centers in one shot.
            wrap.style.transform = `translate3d(${vx}px, ${vy}px, 0px) translate(-50%, -50%)`;
        }
    };

    // 1. Bind EventBus high-frequency event (mounts once per lifecycle)
    useEffect(() => {
        const onAimUpdate = (data: {
            x: number;
            y: number;
            isLocked: boolean;
            visible: boolean;
        }) => {
            // Update latest coords & state
            lastCoordRef.current = { x: data.x, y: data.y };
            visibleRef.current = data.visible;

            // rAF throttle: if a frame is already queued, skip re-scheduling.
            if (rafIdRef.current === null) {
                rafIdRef.current = requestAnimationFrame(() => {
                    rafIdRef.current = null;
                    applyTransform();
                });
            }

            // Only low-frequency UI changes trigger React setState
            setIsLocked((prev) => (prev === data.isLocked ? prev : data.isLocked));
        };

        EventBus.on('aim-crosshair-update', onAimUpdate);
        return () => {
            EventBus.removeListener('aim-crosshair-update', onAimUpdate);
            if (rafIdRef.current !== null) {
                cancelAnimationFrame(rafIdRef.current);
            }
        };
    }, []);

    // 2. Watch Game Canvas resize / layout changes
    useEffect(() => {
        let ro: ResizeObserver | null = null;
        let canvas: HTMLCanvasElement | null = null;
        let observer: MutationObserver | null = null;

        const update = (): void => {
            if (!canvas) return;
            const r = appRect(canvas);
            rectRef.current = { left: r.left, top: r.top, width: r.width, height: r.height };
            // Re-apply coords immediately on layout change.
            applyTransform();
        };

        const install = (): boolean => {
            if (canvas) return true;
            canvas = document.querySelector('#game-container canvas') as HTMLCanvasElement | null;
            if (!canvas) return false;

            update();
            ro = new ResizeObserver(update);
            ro.observe(canvas);
            window.addEventListener('resize', update);
            window.visualViewport?.addEventListener('resize', update);
            return true;
        };

        if (!install()) {
            const container = document.getElementById('game-container');
            if (container) {
                observer = new MutationObserver(() => {
                    if (install()) observer?.disconnect();
                });
                observer.observe(container, { childList: true, subtree: true });
            }
        }

        return () => {
            observer?.disconnect();
            ro?.disconnect();
            window.removeEventListener('resize', update);
            window.visualViewport?.removeEventListener('resize', update);
        };
    }, []);

    return (
        <div
            ref={wrapRef}
            // left-0 top-0 is the base; translate3d fully owns position.
            className="pointer-events-none fixed left-0 top-0 z-50 select-none will-change-transform"
            style={{
                visibility: 'hidden', // Hidden by default; direct DOM drives visibility
                transform: 'translate3d(-100px, -100px, 0px) translate(-50%, -50%)',
            }}
            data-testid="pixel-crosshair"
        >
            <div
                // Only animate the transform property; avoid full-attribute
                // interpolation / reflow during animation.
                className={`transition-transform duration-150 ease-out ${isLocked ? 'animate-crosshair-breathe' : 'scale-100'
                    }`}
            >
                <svg
                    width={34}
                    height={34}
                    viewBox="0 0 32 32"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    style={{ imageRendering: 'pixelated', shapeRendering: 'crispEdges' }}
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