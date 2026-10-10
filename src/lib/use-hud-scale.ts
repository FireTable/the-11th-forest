/**
 * src/lib/use-hud-scale.ts
 * --------------------------------------------------------------------------
 * One scale factor shared by every DOM HUD layer (`GameHUDLayer`,
 * `TouchControls`) so panels, weapon slots and the joystick shrink
 * together on small screens.
 *
 * Two curves, because the two layouts have different floors:
 *   - desktop chrome is designed against a 1536x864 canvas, so it scales
 *     with the viewport and may go down to half size;
 *   - mobile chrome is already compact and contains *touch targets*,
 *     so it scales off viewport height against a typical phone-landscape
 *     height and never drops below 0.7 (a 56px weapon slot stays ~39px,
 *     still a comfortable tap target).
 */

import { useEffect, useState } from 'react';

import { appRect, appViewport, isMobileLike } from '@/lib/mobile';

/** Height (app-space px) at which the mobile HUD renders at 1×. */
const MOBILE_REFERENCE_H = 480;

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** Pure scale curve — exported for tests. */
export function hudScale(width: number, height: number, mobile: boolean): number {
    if (width <= 0 || height <= 0) return 1;
    if (mobile) return clamp(height / MOBILE_REFERENCE_H, 0.7, 1);
    return clamp(Math.min(width / 1536, height / 864), 0.5, 1);
}

/** Live HUD scale + the app-space canvas / container bounds it is anchored to. */
export function useHudScale(): {
    scale: number;
    width: number;
    height: number;
    left: number;
    top: number;
} {
    const [box, setBox] = useState(() => {
        const vp = appViewport();
        return {
            left: 0,
            top: 0,
            width: vp.width,
            height: vp.height,
            mobile: isMobileLike(),
        };
    });

    useEffect(() => {
        let ro: ResizeObserver | null = null;
        let canvas: HTMLCanvasElement | null = null;
        let observer: MutationObserver | null = null;

        const evaluate = (): void => {
            const vp = appViewport();

            // Try to measure the actual Phaser canvas inside #game-container
            if (!canvas) {
                canvas = document.querySelector(
                    '#game-container canvas',
                ) as HTMLCanvasElement | null;
            }

            if (canvas) {
                const r = appRect(canvas);
                if (r.width > 0 && r.height > 0) {
                    setBox((prev) =>
                        prev.left === r.left &&
                        prev.top === r.top &&
                        prev.width === r.width &&
                        prev.height === r.height
                            ? prev
                            : {
                                  left: r.left,
                                  top: r.top,
                                  width: r.width,
                                  height: r.height,
                                  mobile: isMobileLike(),
                              },
                    );
                    return;
                }
            }

            // Fallback: estimate canvas bounds within #game-container
            const container = document.getElementById('game-container');
            if (container) {
                const cr = appRect(container);
                if (cr.width > 0 && cr.height > 0) {
                    const zoom = Math.min(cr.width / 1536, cr.height / 864);
                    const cw = 1536 * zoom;
                    const ch = 864 * zoom;
                    const cl = cr.left + (cr.width - cw) / 2;
                    const ct = cr.top + (cr.height - ch) / 2;
                    setBox((prev) =>
                        prev.left === cl &&
                        prev.top === ct &&
                        prev.width === cw &&
                        prev.height === ch
                            ? prev
                            : {
                                  left: cl,
                                  top: ct,
                                  width: cw,
                                  height: ch,
                                  mobile: isMobileLike(),
                              },
                    );
                    return;
                }
            }

            // Fallback: full app viewport
            setBox((prev) =>
                prev.width === vp.width &&
                prev.height === vp.height &&
                prev.left === 0 &&
                prev.top === 0
                    ? prev
                    : {
                          left: 0,
                          top: 0,
                          width: vp.width,
                          height: vp.height,
                          mobile: isMobileLike(),
                      },
            );
        };

        evaluate();
        window.addEventListener('resize', evaluate);
        window.visualViewport?.addEventListener('resize', evaluate);

        const container = document.getElementById('game-container');
        if (container) {
            ro = new ResizeObserver(evaluate);
            ro.observe(container);

            observer = new MutationObserver(() => {
                evaluate();
            });
            observer.observe(container, { childList: true, subtree: true });
        }

        return () => {
            window.removeEventListener('resize', evaluate);
            window.visualViewport?.removeEventListener('resize', evaluate);
            ro?.disconnect();
            observer?.disconnect();
        };
    }, []);

    return {
        scale: hudScale(box.width, box.height, box.mobile),
        width: box.width,
        height: box.height,
        left: box.left,
        top: box.top,
    };
}
