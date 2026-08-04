import React from 'react';
import { useGameStore } from '@/store/game-store';

import { CornerPixels, RETRO_BOX } from './retro-box';

/** Format milliseconds as `MM:SS` (zero-padded, capped at 99:59). */
const formatElapsed = (ms: number): string => {
    const totalSec = Math.floor(ms / 1000);
    const mm = Math.min(99, Math.floor(totalSec / 60));
    const ss = totalSec % 60;
    return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
};

export const SceneHubOverlay: React.FC = () => {
    const { levelTitle, levelElapsedMs } = useGameStore();

    if (!levelTitle) return null;

    return (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-20 pointer-events-none select-none flex font-['Silkscreen',monospace]">
            {/* Retro Pixel Box - Dark Outer Border + Amber Accent Corners */}
            <div className={`${RETRO_BOX} relative flex items-center gap-3 px-5 py-2`}>
                <CornerPixels />

                <div className="flex flex-col items-center gap-0.5">
                    <span className="text-xs font-bold tracking-wider text-amber-500 uppercase drop-shadow-[1px_1px_0px_#000] leading-tight">
                        {levelTitle}
                    </span>
                    <span className="text-[10px] text-white uppercase tracking-widest font-semibold leading-none mt-1 drop-shadow-[1px_1px_0px_#000]">
                        {formatElapsed(levelElapsedMs)}
                    </span>
                </div>
            </div>
        </div>
    );
};
