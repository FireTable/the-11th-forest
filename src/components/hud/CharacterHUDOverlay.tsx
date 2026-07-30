import React from 'react';
import { useGameStore } from '@/store/game-store';

export const CharacterHUDOverlay: React.FC = () => {
    const { characterName, hp, maxHp, sp, maxSp, hubsVisible } = useGameStore();

    if (!hubsVisible) return null;

    const hpPercent = Math.max(0, Math.min(100, (hp / (maxHp || 1)) * 100));
    const spPercent = Math.max(0, Math.min(100, (sp / (maxSp || 1)) * 100));

    return (
        <div className="absolute bottom-6 left-6 z-20 pointer-events-none select-none flex flex-col gap-2 font-mono">
            {/* Glassmorphism Panel Container */}
            <div className="bg-slate-950/80 backdrop-blur-md border border-emerald-500/30 rounded-xl p-3.5 shadow-2xl shadow-emerald-950/40 min-w-[240px]">
                {/* Character Name & Icon Header */}
                <div className="flex items-center gap-2 mb-2 pb-1.5 border-b border-emerald-500/20">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                    <span className="text-sm font-bold tracking-wider text-emerald-300 uppercase">
                        {characterName}
                    </span>
                    <span className="ml-auto text-[10px] text-emerald-400/60 tracking-widest font-mono">
                        SURVIVOR
                    </span>
                </div>

                {/* Bars section */}
                <div className="flex flex-col gap-2">
                    {/* HP Bar */}
                    <div className="flex flex-col gap-1">
                        <div className="flex justify-between items-center text-[11px] font-semibold">
                            <span className="text-emerald-400 flex items-center gap-1">
                                <span className="text-xs">♥</span> HP
                            </span>
                            <span className="text-emerald-200/90 font-bold tracking-tight">
                                {Math.ceil(hp)} <span className="text-emerald-500/60 font-normal">/ {maxHp}</span>
                            </span>
                        </div>
                        <div className="h-3 w-full bg-slate-900/90 rounded-full overflow-hidden p-0.5 border border-emerald-900/50 shadow-inner">
                            <div
                                className="h-full bg-gradient-to-r from-emerald-600 via-emerald-400 to-teal-300 rounded-full transition-all duration-200 ease-out shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                                style={{ width: `${hpPercent}%` }}
                            />
                        </div>
                    </div>

                    {/* SP Bar */}
                    <div className="flex flex-col gap-1">
                        <div className="flex justify-between items-center text-[11px] font-semibold">
                            <span className="text-cyan-400 flex items-center gap-1">
                                <span className="text-xs">⚡</span> SP
                            </span>
                            <span className="text-cyan-200/90 font-bold tracking-tight">
                                {Math.ceil(sp)} <span className="text-cyan-500/60 font-normal">/ {maxSp}</span>
                            </span>
                        </div>
                        <div className="h-2 w-full bg-slate-900/90 rounded-full overflow-hidden p-0.5 border border-cyan-900/50 shadow-inner">
                            <div
                                className="h-full bg-gradient-to-r from-cyan-600 to-sky-400 rounded-full transition-all duration-150 ease-out shadow-[0_0_8px_rgba(6,182,212,0.4)]"
                                style={{ width: `${spPercent}%` }}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
