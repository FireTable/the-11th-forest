import React from 'react';
import { useGameStore } from '@/store/game-store';

/** Format milliseconds as `MM:SS` (zero-padded, capped at 99:59). */
export function formatElapsed(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const mm = Math.min(99, Math.floor(totalSec / 60));
    const ss = totalSec % 60;
    return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

/**
 * Top-center HUD that shows elapsed time since the current level started.
 * Reads `levelElapsedMs` from the game store; the scene pushes updates
 * via `tickLevelClock()` ~5 times/sec.
 */
export const LevelTimeHud: React.FC = () => {
    const elapsedMs = useGameStore((s) => s.levelElapsedMs);
    const hubsVisible = useGameStore((s) => s.hubsVisible);
    if (!hubsVisible) return null;
    return (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 pointer-events-none select-none flex font-['Silkscreen',monospace]">
            <div className="bg-stone-950/40 px-4 py-1 flex items-center gap-2 border-2 border-stone-900/80 shadow-[0_4px_16px_rgba(0,0,0,0.5),inset_0_0_0_1px_rgba(245,158,11,0.25)] backdrop-blur-sm relative">
                <div className="absolute -top-[3px] -left-[3px] w-[3px] h-[3px] bg-amber-400" />
                <div className="absolute -top-[3px] -right-[3px] w-[3px] h-[3px] bg-amber-400" />
                <div className="absolute -bottom-[3px] -left-[3px] w-[3px] h-[3px] bg-amber-400" />
                <div className="absolute -bottom-[3px] -right-[3px] w-[3px] h-[3px] bg-amber-400" />
                <span className="text-[8px] text-amber-500 uppercase tracking-widest font-semibold leading-none drop-shadow-[1px_1px_0px_#000]">
                    TIME
                </span>
                <span className="text-sm font-bold tracking-wider text-amber-200 drop-shadow-[1px_1px_0px_#000] tabular-nums">
                    {formatElapsed(elapsedMs)}
                </span>
            </div>
        </div>
    );
};