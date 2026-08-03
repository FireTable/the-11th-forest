import React from 'react';
import { CharacterHUDOverlay } from './CharacterHUDOverlay';
import { DeathOverlay } from './DeathOverlay';
import { WeaponHUDOverlay } from './WeaponHUDOverlay';
import { SceneHubOverlay } from './SceneHubOverlay';

import { useHudScale } from '@/lib/use-hud-scale';

/**
 * Wrapper that gives every HUD overlay one coordinate space.
 *
 * The layer covers the whole app box — not the canvas rect. The canvas
 * now *covers* its container and overflows it, and anchoring HUD chrome
 * to an overflowing box pushes panels off-screen. Children anchor to the
 * layer's edges with plain `absolute top/left/right/bottom`, so the
 * layer is laid out at `viewport / scale` and then scaled back down:
 * corners land in the real corners at any zoom and every child shrinks
 * uniformly.
 *
 * Being inside `#app` means the forced-landscape rotation is inherited
 * for free — `appViewport()` already reports the rotated dimensions.
 */
export const GameHUDLayer: React.FC = () => {
    const { scale, width, height } = useHudScale();

    const style: React.CSSProperties =
        width > 0
            ? {
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  width: `${width / scale}px`,
                  height: `${height / scale}px`,
                  transform: `scale(${scale})`,
                  transformOrigin: 'top left',
              }
            : { position: 'absolute', inset: 0 };

    return (
        <div style={style} className="pointer-events-none overflow-hidden z-10">
            <SceneHubOverlay />
            <CharacterHUDOverlay />
            <WeaponHUDOverlay />
            <DeathOverlay />
        </div>
    );
};
