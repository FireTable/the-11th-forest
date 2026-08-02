import React from 'react';

import { useGameStore } from '@/store/game-store';
import { EventBus } from '@/lib/events/bus';
import { useIsMobile } from '@/lib/use-is-mobile';

/**
 * Weapon HUD.
 *
 * - Desktop: full retro box with weapon name, ammo, reload progress,
 *   and the 1/2/3/... slot hotbar at bottom-right (single column).
 * - Mobile: horizontal slot strip above the [DODGE][FIRE] cluster —
 *   each slot shows the weapon's thumbnail + name + ammo badge,
 *   tappable to switch. Same visual language as the desktop slot bar
 *   so the player isn't relearning the hotbar on a phone.
 */

const SLOT_PX = 56;
const SLOT_GAP_PX = 6;
const SLOT_BOTTOM_PX = 124;

export const WeaponHUDOverlay: React.FC = () => {
    const { activeWeaponIndex, activeWeaponName, isReloading, reloadProgress, slots, hubsVisible } =
        useGameStore();
    const mobile = useIsMobile();

    if (!hubsVisible || !activeWeaponName || slots.length === 0) return null;

    if (mobile) {
        const handleSwitch = (index: number): void => {
            EventBus.emit('mobile:weapon:switch', { index });
        };
        const stripWidth = slots.length * SLOT_PX + (slots.length - 1) * SLOT_GAP_PX;
        return (
            <div
                className="absolute z-20 select-none font-['Silkscreen',monospace] flex items-end"
                style={{
                    right: 16,
                    bottom: SLOT_BOTTOM_PX,
                    width: stripWidth,
                    gap: SLOT_GAP_PX,
                }}
                data-testid="weapon-slot-strip"
            >
                {slots.map((slot, index) => {
                    const isActive = index === activeWeaponIndex;
                    const showReloading = isActive && isReloading;
                    return (
                        <button
                            key={slot.id || index}
                            type="button"
                            onPointerDown={(e) => {
                                e.preventDefault();
                                handleSwitch(index);
                            }}
                            aria-label={`Switch to ${slot.name}`}
                            data-testid={`weapon-slot-${index}`}
                            className={`relative flex items-center justify-center border-2 transition-all active:scale-95 pointer-events-auto ${
                                isActive
                                    ? 'bg-amber-950/90 border-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.6)]'
                                    : 'bg-stone-950/70 border-stone-700 hover:border-amber-700/60'
                            }`}
                            style={{ width: SLOT_PX, height: SLOT_PX }}
                        >
                            {slot.texture ? (
                                <img
                                    src={slot.texture}
                                    alt={slot.name}
                                    draggable={false}
                                    className="w-10 h-10 object-contain pointer-events-none"
                                    style={{ imageRendering: 'pixelated' }}
                                />
                            ) : (
                                <span className="text-[10px] font-bold text-amber-200/80 text-center leading-tight px-1 pointer-events-none">
                                    {slot.name}
                                </span>
                            )}
                            {/* Index badge — top-left corner */}
                            <span
                                className={`absolute top-0 left-0 px-1 text-[9px] font-bold leading-none ${
                                    isActive
                                        ? 'bg-amber-400 text-black'
                                        : 'bg-stone-800 text-stone-400'
                                }`}
                            >
                                {index + 1}
                            </span>
                            {/* Ammo badge — bottom-right corner */}
                            {slot.clipSize > 1 && (
                                <span
                                    className={`absolute bottom-0 right-0 px-1 text-[9px] font-bold font-mono leading-none border ${
                                        isActive
                                            ? 'bg-black/85 text-amber-300 border-amber-700'
                                            : 'bg-black/70 text-stone-400 border-stone-700'
                                    }`}
                                >
                                    {String(slot.ammo).padStart(2, '0')}
                                </span>
                            )}
                            {/* Reload progress overlay (active slot only) */}
                            {showReloading && (
                                <div
                                    className="absolute inset-x-0 bottom-0 h-1 bg-amber-400/80 pointer-events-none"
                                    style={{
                                        width: `${Math.max(
                                            0,
                                            Math.min(100, reloadProgress * 100),
                                        )}%`,
                                    }}
                                />
                            )}
                        </button>
                    );
                })}
            </div>
        );
    }

    return (
        <div className="absolute bottom-6 right-6 z-20 pointer-events-none select-none font-['Silkscreen',monospace] w-[280px]">
            {/* Vertical stack of per-weapon cards. Each card owns its own
             *  retro pixel frame (background, dark border, 4 amber corner
             *  pixels, inset glow). The weapon's own texture floats in
             *  the lower-right corner as a decorative background — stats
             *  text sits to its left so the visual reads like a poster. */}
            <div className="flex flex-col gap-1.5">
                {slots.map((slot, index) => {
                    const isActive = index === activeWeaponIndex;
                    const showReloading = isActive && isReloading;
                    const ammoFrac =
                        slot.clipSize > 0
                            ? Math.max(0, Math.min(100, (slot.ammo / slot.clipSize) * 100))
                            : 100;
                    return (
                        <button
                            key={slot.id || index}
                            type="button"
                            onPointerDown={(e) => {
                                // Stop the click from falling through to
                                // the Phaser canvas underneath.
                                e.preventDefault();
                                EventBus.emit('mobile:weapon:switch', { index });
                            }}
                            aria-label={`Switch to ${slot.name}`}
                            data-testid={`desktop-weapon-slot-${index}`}
                            className={`relative border-2 transition-all duration-150 pointer-events-auto cursor-pointer backdrop-blur-sm h-[64px] overflow-hidden ${
                                isActive
                                    ? 'bg-amber-950/85 border-amber-400 shadow-[0_4px_12px_rgba(0,0,0,0.45),inset_0_0_8px_rgba(245,158,11,0.4)]'
                                    : 'bg-black/55 border-stone-800 text-stone-400 shadow-[0_2px_8px_rgba(0,0,0,0.45)] hover:border-amber-700/60 hover:text-amber-200/80'
                            }`}
                        >
                            {/* 4 Retro Corner Pixels — this card IS the box. */}
                            <span className="absolute -top-[3px] -left-[3px] w-[3px] h-[3px] bg-amber-400 pointer-events-none z-10" />
                            <span className="absolute -top-[3px] -right-[3px] w-[3px] h-[3px] bg-amber-400 pointer-events-none z-10" />
                            <span className="absolute -bottom-[3px] -left-[3px] w-[3px] h-[3px] bg-amber-400 pointer-events-none z-10" />
                            <span className="absolute -bottom-[3px] -right-[3px] w-[3px] h-[3px] bg-amber-400 pointer-events-none z-10" />

                            {/* Hotkey badge — top-left of card */}
                            <span
                                className={`absolute top-0 left-0 px-1 text-[9px] font-bold leading-none z-10 ${
                                    isActive
                                        ? 'bg-amber-400 text-black'
                                        : 'bg-stone-800 text-stone-400'
                                }`}
                            >
                                {index + 1}
                            </span>

                            {/* Weapon texture — lower-right background
                             *  decoration. Rendered as a CSS background-image
                             *  (not an <img>) so it doesn't participate in the
                             *  layout flow and can be sized/positioned freely.
                             *  Stats text above (z-10) sits on top and stays
                             *  readable regardless of weapon image. */}
                            {slot.texture ? (
                                <span
                                    aria-hidden
                                    className="absolute right-2 bottom-1 w-[68px] h-[68px] pointer-events-none"
                                    style={{
                                        backgroundImage: `url(${slot.texture})`,
                                        backgroundSize: 'contain',
                                        backgroundPosition: 'right bottom',
                                        backgroundRepeat: 'no-repeat',
                                        imageRendering: 'pixelated',
                                        opacity: isActive ? 1 : 0.7,
                                    }}
                                />
                            ) : (
                                // Melee weapons (e.g. drone-claws) may not
                                // have a `visual.texture` — fall back to a
                                // small name label tucked into the lower
                                // right of the card.
                                <span className="absolute right-2 bottom-2 text-[9px] font-bold text-amber-200/60 text-center leading-tight px-1 pointer-events-none">
                                    {slot.name}
                                </span>
                            )}

                            {/* Stats overlay — sits in the upper-left, with
                             *  right-padding to clear the weapon visual. */}
                            <div className="absolute inset-0 flex flex-col justify-center pl-3.5 pr-[80px] py-2 gap-1.5 pointer-events-none">
                                <div className="flex items-baseline gap-2 min-w-0">
                                    <span
                                        className={`text-[11px] font-bold tracking-wide uppercase truncate ${
                                            isActive ? 'text-amber-200' : 'text-stone-500'
                                        }`}
                                        title={slot.name}
                                    >
                                        {slot.name}
                                    </span>
                                    <span
                                        className={`text-[12px] font-mono leading-none tabular-nums whitespace-nowrap shrink-0 ${
                                            isActive ? 'text-amber-300' : 'text-stone-400'
                                        }`}
                                    >
                                        {String(slot.ammo).padStart(2, '0')}
                                        <span className="text-stone-500"> / </span>
                                        {String(slot.clipSize).padStart(2, '0')}
                                    </span>
                                </div>
                                <div className="h-1 w-full bg-stone-900/80 border border-stone-700">
                                    <div
                                        className={`h-full ${
                                            isActive ? 'bg-amber-400' : 'bg-stone-600'
                                        }`}
                                        style={{ width: `${ammoFrac}%` }}
                                    />
                                </div>
                            </div>

                            {/* Reload progress overlay (active slot only). */}
                            {showReloading && (
                                <div
                                    className="absolute inset-x-0 bottom-0 h-1 bg-amber-400/80 pointer-events-none z-10"
                                    style={{
                                        width: `${Math.max(
                                            0,
                                            Math.min(100, reloadProgress * 100),
                                        )}%`,
                                    }}
                                />
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};
