import React from 'react';
import { useGameStore } from '@/store/game-store';

export const WeaponHUDOverlay: React.FC = () => {
    const {
        activeWeaponIndex,
        activeWeaponName,
        activeAmmo,
        activeMaxAmmo,
        isReloading,
        reloadProgress,
        slots,
        hubsVisible,
    } = useGameStore();

    if (!hubsVisible) return null;

    return (
        <div className="absolute bottom-6 right-6 z-20 pointer-events-none select-none flex flex-col gap-3 font-mono items-end">
            {/* Main Panel */}
            <div className="bg-slate-950/85 backdrop-blur-md border border-amber-500/30 rounded-xl p-4 shadow-2xl shadow-amber-950/40 w-72 flex flex-col gap-3">
                {/* Active Weapon Name & Big Ammo Display */}
                <div className="flex justify-between items-start border-b border-amber-500/20 pb-2">
                    <div className="flex flex-col">
                        <span className="text-[10px] text-amber-400/60 uppercase tracking-widest font-semibold">
                            ACTIVE WEAPON
                        </span>
                        <span className="text-lg font-black tracking-wide text-amber-300 drop-shadow-[0_0_8px_rgba(252,211,77,0.4)]">
                            {activeWeaponName || 'EQUIPPED'}
                        </span>
                    </div>
                    <div className="flex items-baseline gap-1 font-mono">
                        <span className="text-3xl font-black text-amber-400 drop-shadow-[0_0_10px_rgba(251,191,36,0.6)]">
                            {String(activeAmmo).padStart(2, '0')}
                        </span>
                        <span className="text-xs font-bold text-amber-500/60">
                            / {activeMaxAmmo}
                        </span>
                    </div>
                </div>

                {/* Reloading Bar */}
                {isReloading && (
                    <div className="flex flex-col gap-1 my-0.5">
                        <div className="flex justify-between items-center text-[10px] text-amber-300 font-bold uppercase tracking-wider animate-pulse">
                            <span>Reloading...</span>
                            <span>{Math.round(reloadProgress * 100)}%</span>
                        </div>
                        <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden border border-amber-500/40">
                            <div
                                className="h-full bg-gradient-to-r from-amber-600 via-yellow-400 to-amber-200 rounded-full transition-all duration-75 shadow-[0_0_8px_rgba(251,191,36,0.8)]"
                                style={{ width: `${Math.min(100, reloadProgress * 100)}%` }}
                            />
                        </div>
                    </div>
                )}

                {/* Hotbar Slots */}
                <div className="grid grid-cols-3 gap-2 pt-1">
                    {slots.map((slot, index) => {
                        const isActive = index === activeWeaponIndex;
                        return (
                            <div
                                key={slot.id || index}
                                className={`relative flex flex-col justify-between p-2 rounded-lg border transition-all duration-200 ${
                                    isActive
                                        ? 'bg-amber-500/20 border-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.3)] scale-[1.03]'
                                        : 'bg-slate-900/60 border-slate-800 text-slate-400'
                                }`}
                            >
                                {/* Slot Hotkey */}
                                <div className="flex justify-between items-center mb-1">
                                    <span
                                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                            isActive
                                                ? 'bg-amber-400 text-slate-950'
                                                : 'bg-slate-800 text-slate-400'
                                        }`}
                                    >
                                        {index + 1}
                                    </span>
                                </div>

                                {/* Weapon Name */}
                                <span
                                    className={`text-xs font-bold truncate ${
                                        isActive ? 'text-amber-200' : 'text-slate-400'
                                    }`}
                                >
                                    {slot.name}
                                </span>

                                {/* Slot Ammo */}
                                <span
                                    className={`text-[10px] mt-1 self-end ${
                                        isActive ? 'text-amber-300/80 font-semibold' : 'text-slate-500'
                                    }`}
                                >
                                    {slot.ammo}/{slot.clipSize}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
