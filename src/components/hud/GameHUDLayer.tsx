import React, { useEffect, useState } from 'react';
import { CharacterHUDOverlay } from './CharacterHUDOverlay';
import { WeaponHUDOverlay } from './WeaponHUDOverlay';

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

    // Fallback: full viewport if canvas not ready yet
    const style: React.CSSProperties = bounds.width > 0 ? {
        position: 'absolute',
        left: `${bounds.left}px`,
        top: `${bounds.top}px`,
        width: `${bounds.width}px`,
        height: `${bounds.height}px`,
    } : {
        position: 'absolute',
        inset: 0,
    };

    return (
        <div style={style} className="pointer-events-none overflow-hidden z-10">
            <CharacterHUDOverlay />
            <WeaponHUDOverlay />
        </div>
    );
};
