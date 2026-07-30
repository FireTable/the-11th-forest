import React, { useEffect, useState } from 'react';
import { EventBus } from '@/lib/events/bus';

export const PixelCrosshair: React.FC = () => {
    const [pos, setPos] = useState<{ x: number; y: number; isLocked: boolean; visible: boolean }>({
        x: -100,
        y: -100,
        isLocked: false,
        visible: false,
    });

    useEffect(() => {
        const onAimUpdate = (data: { x: number; y: number; isLocked: boolean; visible: boolean }) => {
            setPos(data);
        };

        EventBus.on('aim-crosshair-update', onAimUpdate);
        return () => {
            EventBus.removeListener('aim-crosshair-update', onAimUpdate);
        };
    }, []);

    if (!pos.visible) return null;

    return (
        <div
            className="pointer-events-none absolute z-50 transform -translate-x-1/2 -translate-y-1/2 select-none"
            style={{ left: `${pos.x}px`, top: `${pos.y}px` }}
        >
            {/* Pixel Art Crosshair Container with Scale Breathing Animation on Lock */}
            <div
                className={`transition-all duration-150 ease-out ${
                    pos.isLocked ? 'animate-crosshair-breathe' : 'scale-100'
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
                    {/* ── 1. Top-Left L-Corner (White with Black Outline) ── */}
                    <path d="M 2 2 H 11 V 8 H 8 V 11 H 2 Z" fill="black" />
                    <path d="M 4 4 H 9 V 6 H 6 V 9 H 4 Z" fill="#ffffff" />

                    {/* ── 2. Top-Right L-Corner (White with Black Outline) ── */}
                    <path d="M 21 2 H 30 V 11 H 24 V 8 H 21 Z" fill="black" />
                    <path d="M 23 4 H 28 V 9 H 26 V 6 H 23 Z" fill="#ffffff" />

                    {/* ── 3. Bottom-Left L-Corner (White with Black Outline) ── */}
                    <path d="M 2 21 H 8 V 24 H 11 V 30 H 2 Z" fill="black" />
                    <path d="M 4 23 H 6 V 26 H 9 V 28 H 4 Z" fill="#ffffff" />

                    {/* ── 4. Bottom-Right L-Corner (White with Black Outline) ── */}
                    <path d="M 24 21 H 30 V 30 H 21 V 24 H 24 Z" fill="black" />
                    <path d="M 26 23 H 28 V 28 H 23 V 26 H 26 Z" fill="#ffffff" />

                    {/* ── 5. Center Red Pixel Dot ── */}
                    <rect x="13" y="13" width="6" height="6" fill="black" />
                    <rect x="14" y="14" width="4" height="4" fill="#ef4444" />
                </svg>
            </div>
        </div>
    );
};
