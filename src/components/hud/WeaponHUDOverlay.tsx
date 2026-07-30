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

    if (!hubsVisible || !activeWeaponName || slots.length === 0) return null;

    return (
        <div className="absolute bottom-6 right-6 z-20 pointer-events-none select-none flex font-['Silkscreen',monospace]">
            {/* Retro Pixel Box - Dark Outer Border + Amber Accent Corners */}
            <div className="bg-stone-950/40 p-3.5 flex gap-4 items-center border-2 border-stone-900/80 shadow-[0_4px_16px_rgba(0,0,0,0.5),inset_0_0_0_1px_rgba(245,158,11,0.25)] backdrop-blur-sm relative">
                {/* 4 Corner Pixels */}
                <div className="absolute -top-[3px] -left-[3px] w-[3px] h-[3px] bg-amber-400" />
                <div className="absolute -top-[3px] -right-[3px] w-[3px] h-[3px] bg-amber-400" />
                <div className="absolute -bottom-[3px] -left-[3px] w-[3px] h-[3px] bg-amber-400" />
                <div className="absolute -bottom-[3px] -right-[3px] w-[3px] h-[3px] bg-amber-400" />
                {/* Left Side: Active Weapon Details & Reload Bar */}
                <div className="flex flex-col justify-between h-full min-w-[160px] gap-2">
                    <div className="flex flex-col">
                        <span className="text-[9px] text-amber-500/80 uppercase tracking-widest font-semibold">
                            ACTIVE WEAPON
                        </span>
                        <span className="text-sm font-bold tracking-wide text-amber-200 drop-shadow-[1px_1px_0px_#000]">
                            {activeWeaponName || 'EQUIPPED'}
                        </span>
                    </div>

                    {/* Unified Ammo Display */}
                    <div className="flex items-baseline gap-1 my-0.5">
                        <span className="text-2xl font-bold text-amber-400 drop-shadow-[2px_2px_0px_#000]">
                            {String(activeAmmo).padStart(2, '0')}
                        </span>
                        <span className="text-xs font-bold text-stone-400">
                            / {String(activeMaxAmmo).padStart(2, '0')}
                        </span>
                    </div>

                    {/* Reloading Bar Container (Fixed Height) */}
                    <div className="h-5 flex flex-col justify-center">
                        {isReloading ? (
                            <div className="flex flex-col gap-0.5 w-full">
                                <div className="flex justify-between items-center text-[8px] text-amber-300 font-bold uppercase tracking-wider animate-pulse">
                                    <span>RELOADING...</span>
                                    <span>{Math.round(reloadProgress * 100)}%</span>
                                </div>
                                <div className="h-2 w-full bg-stone-900 border border-amber-800 p-[1px] overflow-hidden">
                                    <div
                                        className="h-full bg-amber-400 border-r border-amber-200 transition-all duration-75 min-w-[2px]"
                                        style={{ width: `${Math.max(2, Math.min(100, reloadProgress * 100))}%` }}
                                    />
                                </div>
                            </div>
                        ) : (
                            <div className="text-[8px] text-stone-500 uppercase tracking-widest">
                                READY
                            </div>
                        )}
                    </div>
                </div>

                {/* Vertical Divider */}
                <div className="w-[2px] bg-amber-900/40 self-stretch" />

                {/* Right Side: Vertical Hotbar Slots (1, 2, 3) */}
                <div className="flex flex-col gap-1.5 min-w-[105px]">
                    {slots.map((slot, index) => {
                        const isActive = index === activeWeaponIndex;
                        return (
                            <div
                                key={slot.id || index}
                                className={`flex items-center justify-between px-2 py-1 transition-all duration-150 ${
                                    isActive
                                        ? 'bg-amber-950/80 border-2 border-amber-500 shadow-[inset_0_0_4px_rgba(245,158,11,0.4)]'
                                        : 'bg-black/60 border-2 border-stone-800 text-stone-400'
                                }`}
                            >
                                {/* Slot Hotkey & Name */}
                                <div className="flex items-center gap-1.5 min-w-0">
                                    <span
                                        className={`text-[9px] font-bold px-1 py-0.2 leading-none ${
                                            isActive
                                                ? 'bg-amber-400 text-black'
                                                : 'bg-stone-800 text-stone-400'
                                        }`}
                                    >
                                        {index + 1}
                                    </span>
                                    <span
                                        className={`text-[9px] font-bold truncate max-w-[55px] ${
                                            isActive ? 'text-amber-200' : 'text-stone-500'
                                        }`}
                                    >
                                        {slot.name}
                                    </span>
                                </div>

                                {/* Slot Ammo */}
                                <span
                                    className={`text-[8px] font-mono ml-1 ${
                                        isActive ? 'text-amber-300' : 'text-stone-600'
                                    }`}
                                >
                                    {String(slot.ammo).padStart(2, '0')} / {String(slot.clipSize).padStart(2, '0')}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
