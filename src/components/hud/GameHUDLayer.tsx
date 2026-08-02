import React, { useEffect, useState } from 'react';
import { CharacterHUDOverlay } from './CharacterHUDOverlay';
import { DeathOverlay } from './DeathOverlay';
import { WeaponHUDOverlay } from './WeaponHUDOverlay';
import { SceneHubOverlay } from './SceneHubOverlay';

/** Smallest scale we let the HUD shrink to. Below this, fonts would
 *  become unreadable on tiny Phaser canvases (e.g. portrait phone
 *  letterbox). The rotate-overlay covers that case anyway — this is
 *  belt-and-braces. ponytail: revisit when HUD is redesigned. */
const MIN_HUD_SCALE = 0.45;

/** Largest scale — never zoom HUD above 1×, the desktop mockup is the
 *  visual ceiling (design-time layout assumptions break above). */
const MAX_HUD_SCALE = 1.0;

export const GameHUDLayer: React.FC = () => {
    const [bounds, setBounds] = useState<{
        width: number;
        height: number;
        left: number;
        top: number;
    }>({
        width: 0,
        height: 0,
        left: 0,
        top: 0,
    });

    useEffect(() => {
        const canvas = document.querySelector('#game-container canvas') as HTMLCanvasElement | null;
        if (!canvas) return;

        // ResizeObserver fires on every Phaser Scale.FIT recompute —
        // critical for mobile where orientation changes recompute bounds
        // mid-frame and the old poll interval lags visibly.
        const updateBounds = () => {
            const rect = canvas.getBoundingClientRect();
            setBounds({
                width: rect.width,
                height: rect.height,
                left: rect.left,
                top: rect.top,
            });
        };
        updateBounds();
        const ro = new ResizeObserver(updateBounds);
        ro.observe(canvas);
        window.addEventListener('resize', updateBounds);
        // Some Android browsers don't update getBoundingClientRect until
        // a visualViewport event — subscribe too so the rotate overlay
        // → landscape transition snaps into place.
        window.visualViewport?.addEventListener('resize', updateBounds);
        return () => {
            ro.disconnect();
            window.removeEventListener('resize', updateBounds);
            window.visualViewport?.removeEventListener('resize', updateBounds);
        };
    }, []);

    const nativeW = 1536;
    const nativeH = 864;
    // Use the smaller of width/height-derived scales so the HUD letterboxes
    // with the canvas (which itself uses Phaser Scale.FIT) instead of
    // stretching the bottom-left character HUD off-screen on portrait.
    const rawScale = bounds.width > 0 ? bounds.width / nativeW : 1;
    const heightScale = bounds.height > 0 ? bounds.height / nativeH : rawScale;
    const scale = Math.max(MIN_HUD_SCALE, Math.min(MAX_HUD_SCALE, Math.min(rawScale, heightScale)));

    const style: React.CSSProperties =
        bounds.width > 0
            ? {
                  position: 'absolute',
                  left: `${bounds.left}px`,
                  top: `${bounds.top}px`,
                  width: `${nativeW}px`,
                  height: `${nativeH}px`,
                  transform: `scale(${scale})`,
                  transformOrigin: 'top left',
              }
            : {
                  position: 'absolute',
                  inset: 0,
              };

    return (
        <div style={style} className="pointer-events-none overflow-hidden z-10">
            <SceneHubOverlay />
            <CharacterHUDOverlay />
            <WeaponHUDOverlay />
            <DeathOverlay />
        </div>
    );
};
