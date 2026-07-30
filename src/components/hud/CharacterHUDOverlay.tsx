import React from 'react';
import { Heart, Zap } from 'lucide-react';
import { useGameStore } from '@/store/game-store';

export const CharacterHUDOverlay: React.FC = () => {
    const { characterName, hp, maxHp, sp, maxSp, hubsVisible } = useGameStore();

    if (!hubsVisible || !characterName) return null;

    const hpPercent = Math.max(0, Math.min(100, (hp / (maxHp || 1)) * 100));
    const spPercent = Math.max(0, Math.min(100, (sp / (maxSp || 1)) * 100));

    return (
        <div className="absolute bottom-6 left-6 z-20 pointer-events-none select-none flex flex-col gap-2 font-['Silkscreen',monospace]">
            {/* RPG Wood & Gold Pixel Box */}
            <div className="pixel-box bg-stone-950/95 p-3.5 min-w-[260px] border-2 border-stone-700 shadow-[inset_0_0_8px_rgba(0,0,0,0.8)]">
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
                        <div className="flex justify-between items-center text-[10px] font-bold">
                            <span className="text-red-400 flex items-center gap-1.5 drop-shadow-[1px_1px_0px_#000]">
                                <Heart className="w-3.5 h-3.5 fill-red-500 text-red-400" /> HP
                            </span>
                            <span className="text-stone-200 font-mono tracking-tighter drop-shadow-[1px_1px_0px_#000]">
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
                        <div className="flex justify-between items-center text-[10px] font-bold">
                            <span className="text-sky-400 flex items-center gap-1.5 drop-shadow-[1px_1px_0px_#000]">
                                <Zap className="w-3.5 h-3.5 fill-sky-400 text-sky-300" /> SP
                            </span>
                            <span className="text-stone-200 font-mono tracking-tighter drop-shadow-[1px_1px_0px_#000]">
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
