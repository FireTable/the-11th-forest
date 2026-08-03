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

import { appViewport, isMobileLike } from '@/lib/mobile';

/** Height (app-space px) at which the mobile HUD renders at 1×. */
const MOBILE_REFERENCE_H = 480;

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** Pure scale curve — exported for tests. */
export function hudScale(width: number, height: number, mobile: boolean): number {
    if (width <= 0 || height <= 0) return 1;
    if (mobile) return clamp(height / MOBILE_REFERENCE_H, 0.7, 1);
    return clamp(Math.min(width / 1536, height / 864), 0.5, 1);
}

/** Live HUD scale + the app-space viewport it was derived from. */
export function useHudScale(): { scale: number; width: number; height: number } {
    const [box, setBox] = useState(() => ({ width: 0, height: 0, mobile: false }));

    useEffect(() => {
        const evaluate = (): void => {
            const { width, height } = appViewport();
            setBox((prev) =>
                prev.width === width && prev.height === height
                    ? prev
                    : { width, height, mobile: isMobileLike() },
            );
        };
        evaluate();
        window.addEventListener('resize', evaluate);
        window.visualViewport?.addEventListener('resize', evaluate);
        return () => {
            window.removeEventListener('resize', evaluate);
            window.visualViewport?.removeEventListener('resize', evaluate);
        };
    }, []);

    return {
        scale: hudScale(box.width, box.height, box.mobile),
        width: box.width,
        height: box.height,
    };
}
