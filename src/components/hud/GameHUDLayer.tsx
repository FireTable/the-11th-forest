import React, { useEffect, useState } from 'react';
import { CharacterHUDOverlay } from './CharacterHUDOverlay';
import { DeathOverlay } from './DeathOverlay';
import { WeaponHUDOverlay } from './WeaponHUDOverlay';
import { SceneHubOverlay } from './SceneHubOverlay';
import { PixelCrosshair } from './PixelCrosshair';

export const GameHUDLayer: React.FC = () => {
    const [bounds, setBounds] = useState<{ width: number; height: number; left: number; top: number }>({
        width: 0,
        height: 0,
        left: 0,
        top: 0,
    });

    useEffect(() => {
        const updateBounds = () => {
            const canvas = document.querySelector('#game-container canvas') as HTMLCanvasElement | null;
            if (canvas) {
                const rect = canvas.getBoundingClientRect();
                setBounds({
                    width: rect.width,
                    height: rect.height,
                    left: rect.left,
                    top: rect.top,
                });
            }
        };

        updateBounds();
        const interval = window.setInterval(updateBounds, 250);
        window.addEventListener('resize', updateBounds);
        return () => {
            window.clearInterval(interval);
            window.removeEventListener('resize', updateBounds);
        };
    }, []);

    // Scale factor between actual rendered canvas size and native game size (e.g. 1536x864)
    // We scale the UI container proportionally using CSS transform transform-origin: top left / bottom left / bottom right
    const nativeW = 1536; // Level / Canvas native width
    const nativeH = 864; // Level / Canvas native height
    const scale = bounds.width > 0 ? bounds.width / nativeW : 1;

    const style: React.CSSProperties = bounds.width > 0 ? {
        position: 'absolute',
        left: `${bounds.left}px`,
        top: `${bounds.top}px`,
        width: `${nativeW}px`,
        height: `${nativeH}px`,
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
    } : {
        position: 'absolute',
        inset: 0,
    };

    return (
        <div style={style} className="pointer-events-none overflow-hidden z-10">
            <SceneHubOverlay />
            <CharacterHUDOverlay />
            <WeaponHUDOverlay />
            <PixelCrosshair />
            <DeathOverlay />
        </div>
    );
};
