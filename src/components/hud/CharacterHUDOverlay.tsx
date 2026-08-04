import React from 'react';
import { Heart, Zap } from 'lucide-react';
import { useGameStore } from '@/store/game-store';
import { useIsMobile } from '@/lib/use-is-mobile';

import { CornerPixels, RETRO_BOX } from './retro-box';

export const CharacterHUDOverlay: React.FC = () => {
    const { characterName, hp, maxHp, sp, maxSp, hubsVisible, tavernCleared } =
        useGameStore();
    const mobile = useIsMobile();

    // Hide during tavern phase 1 — the placeholder has no CharacterHud
    // so this overlay would otherwise show a stale characterName carried
    // over from a previous save (characterName is persisted; tavern
    // selection has not happened yet in this run).
    if (!tavernCleared || !hubsVisible || !characterName) return null;

    const hpPercent = Math.max(0, Math.min(100, (hp / (maxHp || 1)) * 100));
    const spPercent = Math.max(0, Math.min(100, (sp / (maxSp || 1)) * 100));

    if (mobile) {
        // Vertical stack: character name on top, then HP + SP bars.
        // The bar fills the available row width and the current /
        // max value sits right-aligned at the bar's end with a black
        // stroke so it's legible against the fill colour.
        return (
            <div className="absolute top-4 left-4 z-20 pointer-events-none select-none font-['Silkscreen',monospace] w-[220px]">
                <div className="flex flex-col gap-1.5 bg-stone-950/55 px-2.5 py-1.5 border border-amber-900/60 backdrop-blur-sm">
                    <span className="text-[10px] font-bold tracking-wider text-amber-200 uppercase drop-shadow-[1px_1px_0px_#000]">
                        {characterName}
                    </span>
                    <div className="flex items-center gap-1.5">
                        <Heart className="w-3 h-3 fill-red-500 text-red-400 shrink-0" />
                        <div className="flex-1 h-2 bg-black border border-red-950 relative">
                            <div
                                className="h-full bg-red-600 transition-all duration-150"
                                style={{ width: `${hpPercent}%` }}
                            />
                            <span className="absolute inset-0 flex items-center justify-end pr-1 text-[9px] font-bold text-white leading-none drop-shadow-[1px_1px_0px_#000]">
                                {Math.ceil(hp)}/{maxHp}
                            </span>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <Zap className="w-3 h-3 fill-sky-400 text-sky-300 shrink-0" />
                        <div className="flex-1 h-2 bg-black border border-sky-950 relative">
                            <div
                                className="h-full bg-sky-500 transition-all duration-150"
                                style={{ width: `${spPercent}%` }}
                            />
                            <span className="absolute inset-0 flex items-center justify-end pr-1 text-[9px] font-bold text-white leading-none drop-shadow-[1px_1px_0px_#000]">
                                {Math.ceil(sp)}/{maxSp}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="absolute bottom-6 left-6 z-20 pointer-events-none select-none flex flex-col gap-2 font-['Silkscreen',monospace]">
            {/* Retro Pixel Box - Dark Outer Border + Amber Accent Corners */}
            <div className={`${RETRO_BOX} relative p-3.5 min-w-[260px]`}>
                <CornerPixels />

                {/* Character Name & Icon Header */}
                <div className="flex items-center gap-2 mb-2 pb-1 border-b-2 border-amber-900/60">
                    <div className="w-2.5 h-2.5 bg-amber-500 border border-black animate-pulse" />
                    <span className="text-xs font-bold tracking-wider text-amber-200 uppercase drop-shadow-[1px_1px_0px_#000]">
                        {characterName}
                    </span>
                    <span className="ml-auto text-[9px] text-amber-600 tracking-widest uppercase">
                        HERO
                    </span>
                </div>

                {/* Bars section */}
                <div className="flex flex-col gap-2.5">
                    {/* HP Bar */}
                    <div className="flex flex-col gap-1">
                        <div className="flex justify-between items-center text-xs font-bold leading-none">
                            <span className="text-red-400 flex items-center gap-1.5 drop-shadow-[1px_1px_0px_#000]">
                                <Heart className="w-4 h-4 fill-red-500 text-red-400 shrink-0" />
                                <span className="leading-none">HP</span>
                            </span>
                            <span className="text-stone-200 font-mono tracking-tighter drop-shadow-[1px_1px_0px_#000] leading-none">
                                {Math.ceil(hp)} / {maxHp}
                            </span>
                        </div>
                        <div className="h-3.5 w-full bg-black p-0.5 border border-red-950">
                            <div
                                className="h-full bg-red-600 border-r border-red-400 transition-all duration-150 ease-out"
                                style={{ width: `${hpPercent}%` }}
                            />
                        </div>
                    </div>

                    {/* SP Bar */}
                    <div className="flex flex-col gap-1">
                        <div className="flex justify-between items-center text-xs font-bold leading-none">
                            <span className="text-sky-400 flex items-center gap-1.5 drop-shadow-[1px_1px_0px_#000]">
                                <Zap className="w-4 h-4 fill-sky-400 text-sky-300 shrink-0" />
                                <span className="leading-none">SP</span>
                                <span className="ml-1 text-[9px] bg-stone-800 text-sky-300 px-1 py-0.5 border border-stone-600 rounded-[2px] leading-none uppercase tracking-tighter inline-flex items-center">
                                    SPACE
                                </span>
                            </span>
                            <span className="text-stone-200 font-mono tracking-tighter drop-shadow-[1px_1px_0px_#000] leading-none">
                                {Math.ceil(sp)} / {maxSp}
                            </span>
                        </div>
                        <div className="h-2.5 w-full bg-black p-0.5 border border-sky-950">
                            <div
                                className="h-full bg-sky-500 border-r border-sky-300 transition-all duration-150 ease-out"
                                style={{ width: `${spPercent}%` }}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
