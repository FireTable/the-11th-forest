import React from 'react';
import { Heart, Zap } from 'lucide-react';
import { useGameStore } from '@/store/game-store';
import { useIsMobile } from '@/lib/use-is-mobile';

export const CharacterHUDOverlay: React.FC = () => {
    const { characterName, hp, maxHp, sp, maxSp, hubsVisible } = useGameStore();
    const mobile = useIsMobile();

    if (!hubsVisible || !characterName) return null;

    const hpPercent = Math.max(0, Math.min(100, (hp / (maxHp || 1)) * 100));
    const spPercent = Math.max(0, Math.min(100, (sp / (maxSp || 1)) * 100));

    if (mobile) {
        // Compact top-left strip — keeps HP/SP visible without colliding
        // with the bottom-left joystick thumb zone.
        return (
            <div className="absolute top-4 left-4 z-20 pointer-events-none select-none font-['Silkscreen',monospace]">
                <div className="flex items-center gap-2 bg-stone-950/55 px-2.5 py-1.5 border border-amber-900/60 backdrop-blur-sm">
                    <div className="flex flex-col gap-1 w-[180px]">
                        <div className="flex items-center gap-1">
                            <Heart className="w-3 h-3 fill-red-500 text-red-400 shrink-0" />
                            <span className="text-[10px] font-bold text-red-300 leading-none">
                                {Math.ceil(hp)}
                            </span>
                            <div className="flex-1 h-2 bg-black border border-red-950">
                                <div
                                    className="h-full bg-red-600 transition-all duration-150"
                                    style={{ width: `${hpPercent}%` }}
                                />
                            </div>
                        </div>
                        <div className="flex items-center gap-1">
                            <Zap className="w-3 h-3 fill-sky-400 text-sky-300 shrink-0" />
                            <span className="text-[10px] font-bold text-sky-300 leading-none">
                                {Math.ceil(sp)}
                            </span>
                            <div className="flex-1 h-2 bg-black border border-sky-950">
                                <div
                                    className="h-full bg-sky-500 transition-all duration-150"
                                    style={{ width: `${spPercent}%` }}
                                />
                            </div>
                        </div>
                    </div>
                    <span className="text-[9px] font-bold tracking-wider text-amber-200 uppercase ml-1">
                        {characterName}
                    </span>
                </div>
            </div>
        );
    }

    return (
        <div className="absolute bottom-6 left-6 z-20 pointer-events-none select-none flex flex-col gap-2 font-['Silkscreen',monospace]">
            {/* Retro Pixel Box - Dark Outer Border + Amber Accent Corners */}
            <div className="bg-stone-950/40 p-3.5 min-w-[260px] border-2 border-stone-900/80 shadow-[0_4px_16px_rgba(0,0,0,0.5),inset_0_0_0_1px_rgba(245,158,11,0.25)] backdrop-blur-sm relative">
                {/* 4 Corner Pixels */}
                <div className="absolute -top-[3px] -left-[3px] w-[3px] h-[3px] bg-amber-400" />
                <div className="absolute -top-[3px] -right-[3px] w-[3px] h-[3px] bg-amber-400" />
                <div className="absolute -bottom-[3px] -left-[3px] w-[3px] h-[3px] bg-amber-400" />
                <div className="absolute -bottom-[3px] -right-[3px] w-[3px] h-[3px] bg-amber-400" />

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
