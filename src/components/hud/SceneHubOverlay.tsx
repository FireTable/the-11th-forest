import React from 'react';
import { useGameStore } from '@/store/game-store';

/** Format milliseconds as `MM:SS` (zero-padded, capped at 99:59). */
const formatElapsed = (ms: number): string => {
    const totalSec = Math.floor(ms / 1000);
    const mm = Math.min(99, Math.floor(totalSec / 60));
    const ss = totalSec % 60;
    return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
};

export const SceneHubOverlay: React.FC = () => {
    const { levelTitle, levelElapsedMs, hubsVisible } = useGameStore();

    if (!hubsVisible || !levelTitle) return null;

    return (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-20 pointer-events-none select-none flex font-['Silkscreen',monospace]">
            {/* Retro Pixel Box - Dark Outer Border + Amber Accent Corners */}
            <div className="bg-stone-950/40 px-5 py-2 flex items-center gap-3 border-2 border-stone-900/80 shadow-[0_4px_16px_rgba(0,0,0,0.5),inset_0_0_0_1px_rgba(245,158,11,0.25)] backdrop-blur-sm relative">
                {/* 4 Corner Pixels for classic retro arcade box look */}
                <div className="absolute -top-[3px] -left-[3px] w-[3px] h-[3px] bg-amber-400" />
                <div className="absolute -top-[3px] -right-[3px] w-[3px] h-[3px] bg-amber-400" />
                <div className="absolute -bottom-[3px] -left-[3px] w-[3px] h-[3px] bg-amber-400" />
                <div className="absolute -bottom-[3px] -right-[3px] w-[3px] h-[3px] bg-amber-400" />


                <div className="flex flex-col items-center gap-0.5">
                    <span className="text-xs font-bold tracking-wider text-amber-200 uppercase drop-shadow-[1px_1px_0px_#000] leading-tight">
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
