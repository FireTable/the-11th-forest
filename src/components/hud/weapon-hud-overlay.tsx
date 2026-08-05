import React from 'react';

import { useGameStore } from '@/store/game-store';
import { EventBus } from '@/lib/events/bus';
import { useIsMobile } from '@/lib/use-is-mobile';

import { CornerPixels } from './retro-box';

/**
 * Weapon HUD.
 *
 * - Desktop: poker-fan of cards at bottom-right. Every slot up to
 *   the character's `weaponMax` is shown — empty placeholders included
 *   so the player can read the carry cap at a glance. Fan is shallow
 *   (7° per slot) and spread horizontally (28 px xShift per slot) so
 *   adjacent cards sit side-by-side instead of fully overlapping.
 * - Mobile: horizontal slot strip above the [DODGE][FIRE] cluster.
 *   Same placeholder logic; empty slots are dim outline-only tiles.
 */

const SLOT_PX = 56;
const SLOT_GAP_PX = 6;
const SLOT_BOTTOM_PX = 124;

/** Shape used in the render loop. Empty placeholders carry `slot: null`
 *  so the renderer knows to draw a dim outline tile instead of a card. */
type DisplaySlot =
    | { kind: 'filled'; slot: ReturnType<typeof useGameStore.getState>['slots'][number] }
    | { kind: 'empty'; slot: null };

export const WeaponHUDOverlay: React.FC = () => {
    const {
        activeWeaponIndex,
        activeWeaponName,
        isReloading,
        reloadProgress,
        slots,
        weaponMax,
        hubsVisible,
    } = useGameStore();
    const mobile = useIsMobile();

    // Show whenever the character has weapons. Tavern phase 1
    // placeholder has no WeaponHud so the store has no slots; that
    // case naturally short-circuits on `slots.length === 0`.
    if (!hubsVisible || !activeWeaponName || slots.length === 0) return null;

    // Always show at least `slots.length` cards; if `weaponMax` was
    // pushed (it is, by CharacterHud after loadCharacter), pad with
    // placeholder tiles up to the cap so the carry limit reads at a
    // glance. `weaponMax === 0` falls back to slots.length.
    const displayCount = Math.max(slots.length, weaponMax);
    const display: DisplaySlot[] = [
        ...slots.map((slot) => ({ kind: 'filled' as const, slot })),
        ...Array.from({ length: displayCount - slots.length }, () => ({
            kind: 'empty' as const,
            slot: null,
        })),
    ];

    if (mobile) {
        const handleSwitch = (index: number): void => {
            EventBus.emit('mobile:weapon:switch', { index });
        };
        const stripWidth = displayCount * SLOT_PX + (displayCount - 1) * SLOT_GAP_PX;
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
                {display.map((entry, index) => {
                    if (entry.kind === 'empty') {
                        return (
                            <div
                                key={`empty-${index}`}
                                data-testid={`weapon-slot-${index}-empty`}
                                aria-hidden="true"
                                className="border-2 border-dashed border-stone-700/60 bg-stone-950/30 pointer-events-none"
                                style={{ width: SLOT_PX, height: SLOT_PX }}
                            >
                                <CornerPixels />
                                <span className="absolute inset-0 flex items-center justify-center text-stone-600 text-lg leading-none select-none">
                                    +
                                </span>
                            </div>
                        );
                    }
                    const slot = entry.slot;
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
        <div className="absolute bottom-6 right-6 z-20 pointer-events-none select-none font-['Silkscreen',monospace] w-[440px]">
            {/* Spread poker fan: 7° per offset (was 12°) so the curve
             *  reads as a gentle hand rather than a tight bouquet.
             *  Horizontal xShift of 28px per slot staggers adjacent
             *  cards side-by-side; the rotation pivot at bottom-centre
             *  keeps them anchored like a wrist. The active card lifts
             *  -20px so it pops in front of its neighbours; cards
             *  further from active index sit lower and dimmer. Empty
             *  placeholders ride the same fan so the cap reads as one
             *  uniform layout. z-index decreases with |offset| so
             *  closer cards overlap farther ones, the same way a hand
             *  stacks. */}
            <div className="relative h-[200px]">
                {display.map((entry, index) => {
                    const offset = index - activeWeaponIndex;
                    const angle = offset * 7;
                    const xShift = offset * 28;
                    const active = index === activeWeaponIndex;
                    const yShift = active ? -20 : Math.abs(offset) * 4;
                    const z = active ? 50 : 40 - Math.abs(offset);

                    if (entry.kind === 'empty') {
                        return (
                            <div
                                key={`empty-${index}`}
                                data-testid={`desktop-weapon-slot-${index}-empty`}
                                aria-hidden="true"
                                style={{
                                    zIndex: z - 1,
                                    transformOrigin: '50% 100%',
                                    transform: `translate(${xShift}px, ${yShift}px) rotate(${angle}deg)`,
                                    bottom: 0,
                                    left: '50%',
                                    marginLeft: -45,
                                }}
                                className="absolute w-[90px] h-[150px] border-2 border-dashed border-stone-700/50 bg-stone-950/30 pointer-events-none"
                            >
                                <CornerPixels />
                                <span className="absolute inset-0 flex items-center justify-center text-stone-600 text-3xl leading-none select-none">
                                    +
                                </span>
                            </div>
                        );
                    }

                    const slot = entry.slot;
                    const isActive = active;
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
                                e.preventDefault();
                                EventBus.emit('mobile:weapon:switch', { index });
                            }}
                            aria-label={`Switch to ${slot.name}`}
                            data-testid={`desktop-weapon-slot-${index}`}
                            style={{
                                zIndex: z,
                                transformOrigin: '50% 100%',
                                transform: `translate(${xShift}px, ${yShift}px) rotate(${angle}deg)`,
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