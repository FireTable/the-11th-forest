import React from 'react';

import { useGameStore } from '@/store/game-store';
import { EventBus } from '@/lib/events/bus';
import { useIsMobile } from '@/lib/use-is-mobile';

import { CornerPixels } from './retro-box';

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
                            className={`relative flex items-center justify-center border-2 transition-all active:scale-95 pointer-events-auto ${isActive
                                ? 'bg-amber-950/90 border-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.6)]'
                                : 'bg-stone-950/70 border-stone-700 hover:border-amber-700/60'
                                }`}
                            style={{ width: SLOT_PX, height: SLOT_PX }}
                        >
                            <CornerPixels />
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
                                className={`absolute top-0 left-0 px-1 text-[9px] font-bold leading-none ${isActive
                                    ? 'bg-amber-400 text-black'
                                    : 'bg-stone-800 text-stone-400'
                                    }`}
                            >
                                {index + 1}
                            </span>
                            {/* Ammo badge — bottom-right corner (current / total) */}
                            {slot.clipSize > 1 && (
                                <span
                                    className={`absolute bottom-0 right-0 px-1 text-[9px] font-bold font-mono leading-none border ${isActive
                                        ? 'bg-black/85 text-amber-300 border-amber-700'
                                        : 'bg-black/70 text-stone-400 border-stone-700'
                                        }`}
                                >
                                    {String(slot.ammo).padStart(2, '0')}/
                                    {String(slot.clipSize).padStart(2, '0')}
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
        <div className="absolute bottom-6 right-6 z-20 pointer-events-none select-none font-['Silkscreen',monospace] w-[300px]">
            {/* Pure-rotation poker fan: every card pivots around its
             *  bottom-centre and fans out by `offset * 12°` of
             *  rotation, with no manual xShift. The pivot at the
             *  bottom edge + the card's own height naturally creates
             *  the spread — the top corners swing outward as the card
             *  tilts, while the bottom corners stay anchored. This
             *  matches a real card hand where cards overlap at the
             *  pivot and fan open at the top. The active card is the
             *  centre (rotate 0°) and lifted 20px so it visually
             *  pops in front of the others. z-index decreases with
             *  |offset| so closer cards overlap farther ones, the
             *  same way a hand stacks. */}
            <div className="relative h-[200px]">
                {slots.map((slot, index) => {
                    const isActive = index === activeWeaponIndex;
                    const showReloading = isActive && isReloading;
                    const ammoFrac =
                        slot.clipSize > 0
                            ? Math.max(0, Math.min(100, (slot.ammo / slot.clipSize) * 100))
                            : 100;
                    const offset = index - activeWeaponIndex;
                    const angle = offset * 12;
                    const yShift = isActive ? -20 : Math.abs(offset) * 4;
                    const z = isActive ? 50 : 40 - Math.abs(offset);
                    return (
                        <button
                            key={slot.id || index}
                            type="button"
                            onPointerDown={(e) => {
                                e.preventDefault();
                                EventBus.emit('mobile:weapon:switch', { index });
                            }}
                            aria-label={`Switch to ${slot.name}`}
                            data-testid={`desktop-weapon-slot-${index}`}
                            style={{
                                zIndex: z,
                                transformOrigin: '50% 100%',
                                transform: `translateY(${yShift}px) rotate(${angle}deg)`,
                                bottom: 0,
                                left: '50%',
                                marginLeft: -45,
                            }}
                            className={`absolute w-[90px] h-[150px] border-2 transition-all duration-200 ease-out pointer-events-auto cursor-pointer backdrop-blur-sm ${isActive
                                ? 'bg-amber-950/85 border-amber-400 shadow-[0_4px_12px_rgba(0,0,0,0.45),inset_0_0_8px_rgba(245,158,11,0.4)]'
                                : 'bg-black/70 border-stone-800 text-stone-400 shadow-[0_2px_8px_rgba(0,0,0,0.45)] hover:border-amber-400 hover:text-amber-200'
                                }`}
                        >
                            <CornerPixels />

                            {/* Hotkey rank — uniform size across active
                             *  and inactive so cards look identical. */}
                            <span
                                className={`absolute top-0.5 left-1 text-[12px] font-bold leading-none z-10 ${isActive
                                    ? 'text-amber-300 drop-shadow-[1px_1px_0px_#000]'
                                    : 'text-stone-400'
                                    }`}
                            >
                                {index + 1}
                            </span>

                            {/* Vertical poster body — texture on top,
                             *  name + ammo in the middle, vertical
                             *  reload bar on the bottom. Identical
                             *  layout for every card. */}
                            {/* Only the fill + texture need clipping; keeping
                             *  `overflow-hidden` off the card itself is what
                             *  lets the corner pixels sit outside the border. */}
                            <div className="absolute inset-0 overflow-hidden">
                                {/* Ammo battery fill — rises from the bottom of the card and
                                 *  drains downward as ammo depletes. Layered
                                 *  behind the texture so the weapon image
                                 *  stays visible; the fill colour (amber for
                                 *  active, stone for inactive) reads through
                                 *  the translucent texture. */}
                                <div
                                    className={`absolute inset-x-0 bottom-0 pointer-events-none transition-[height] duration-500 ease-out ${isActive ? 'bg-amber-400/40' : 'bg-stone-500/25'}`}
                                    style={{ height: `${ammoFrac}%` }}
                                />
                                {slot.texture && (
                                    /* Rendered as a sideways (90° rotated)
                                     *  translucent background — like a gun
                                     *  laid on its side filling the card.
                                     *  After -90° rotation the texture's
                                     *  horizontal axis becomes the card's
                                     *  vertical axis, so the image fills the
                                     *  long dimension while staying within
                                     *  the card's narrow width. */
                                    <img
                                        src={slot.texture}
                                        alt={slot.name}
                                        draggable={false}
                                        className={`absolute pointer-events-none object-contain ${isActive ? 'opacity-80' : 'opacity-50'}`}
                                        style={{
                                            imageRendering: 'pixelated',
                                            top: '50%',
                                            left: '50%',
                                            width: '90px',
                                            height: 'auto',
                                            maxHeight: '150px',
                                            transform: 'translate(-50%, -50%) rotate(-90deg)',
                                        }}
                                    />
                                )}
                            </div>
                            {/* Foreground stats column — sits on top of
                             *  the translucent texture. Vertically
                             *  distributed: hotkey rank, then name +
                             *  ammo stacked in the middle, then the
                             *  horizontal ammo bar pinned at the bottom. */}
                            <div className="absolute inset-0 z-10 flex flex-col items-center justify-between pt-2 pb-2 px-1.5 gap-1 pointer-events-none">
                                {!slot.texture && (
                                    <span
                                        className={`w-14 h-14 flex items-center justify-center text-[8px] font-bold text-center leading-tight px-1 ${isActive ? 'text-amber-200/70' : 'text-stone-400/70'}`}
                                    >
                                        {slot.name}
                                    </span>
                                )}
                                <div className="flex-1" />
                                <div className="flex flex-col items-center gap-1 w-full">
                                    <span
                                        className={`text-[9px] font-bold tracking-wide uppercase text-center leading-tight drop-shadow-[1px_1px_0px_#000] ${isActive ? 'text-amber-200' : 'text-stone-400'}`}
                                        title={slot.name}
                                    >
                                        {slot.name}
                                    </span>
                                    <span
                                        className={`text-[10px] font-mono leading-none tabular-nums drop-shadow-[1px_1px_0px_#000] ${isActive ? 'text-amber-300' : 'text-stone-500'}`}
                                    >
                                        {String(slot.ammo).padStart(2, '0')}
                                        <span className="text-stone-500"> / </span>
                                        {String(slot.clipSize).padStart(2, '0')}
                                    </span>
                                </div>
                            </div>

                            {/* Reload progress overlay (active slot only). */}
                            {showReloading && (
                                <div
                                    className="absolute bottom-0 left-0 right-0 h-1 bg-amber-400/80 pointer-events-none z-10"
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
