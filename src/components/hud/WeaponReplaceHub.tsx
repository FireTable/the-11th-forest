/**
 * src/components/hud/WeaponReplaceHub.tsx
 * --------------------------------------------------------------------------
 * Replaces the auto-pickup flow when the player walks onto a weapon
 * drop while their hotbar is at `weaponMax`.
 *
 *   - TavernController emits `weapon-replace-request` with the
 *     candidate weapon + current slot snapshots.
 *   - This hub renders a centred overlay with up to 4 slot buttons.
 *     Each shows the weapon currently in that slot, or "Empty".
 *   - Locked (专武) slots — weapons that came from the character's
 *     starting hotbar — render dimmed and ignore clicks/keys.
 *   - The player presses 1/2/3/4 (or clicks) to swap that slot with
 *     the candidate weapon. The hub emits `weapon-replace-confirm`;
 *     the scene's tavern controller commits the swap and emits
 *     `weapon-replace-request` with `null` to dismiss the hub.
 *
 * Renders nothing outside the tavern phase-2 replace window, so the
 * overlay has zero cost during normal gameplay.
 */

import React, { useEffect, useState } from 'react';

import { EventBus } from '@/lib/events/bus';
import { useHudScale } from '@/lib/use-hud-scale';

import type { WeaponReplaceRequest } from '@/game/scenes/tavern-controller';

const SLOT_KEYS: ReadonlyArray<{ index: number; label: string; key: string }> = [
    { index: 0, label: '1', key: '1' },
    { index: 1, label: '2', key: '2' },
    { index: 2, label: '3', key: '3' },
    { index: 3, label: '4', key: '4' },
];

export const WeaponReplaceHub: React.FC = () => {
    const [request, setRequest] = useState<WeaponReplaceRequest | null>(null);
    const { scale, width, height } = useHudScale();

    useEffect(() => {
        const handler = (payload: WeaponReplaceRequest | null) => {
            setRequest(payload);
        };
        EventBus.on('weapon-replace-request', handler);
        return () => EventBus.off('weapon-replace-request', handler);
    }, []);

    // Keyboard: 1/2/3/4 select the slot. Escape cancels (same as
    // walking off the drop in a future iteration — for now it just
    // dismisses the hub without picking up).
    useEffect(() => {
        if (!request) return;
        const onKey = (e: KeyboardEvent): void => {
            const slot = SLOT_KEYS.find((s) => s.key === e.key);
            if (slot && slot.index < request.weaponMax) {
                if (request.lockedSlots[slot.index]) return;
                EventBus.emit('weapon-replace-confirm', {
                    slotIndex: slot.index,
                    weaponId: request.weaponId,
                });
                e.preventDefault();
            } else if (e.key === 'Escape') {
                setRequest(null);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [request]);

    if (!request) return null;

    const handleClick = (slotIndex: number): void => {
        if (request.lockedSlots[slotIndex]) return;
        EventBus.emit('weapon-replace-confirm', {
            slotIndex,
            weaponId: request.weaponId,
        });
    };

    const outerStyle: React.CSSProperties =
        width > 0
            ? {
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  width: `${width / scale}px`,
                  height: `${height / scale}px`,
                  transform: `scale(${scale})`,
                  transformOrigin: 'top left',
              }
            : { position: 'absolute', inset: 0 };

    return (
        <div
            className="pointer-events-none [&>*]:pointer-events-none select-none cursor-none overflow-hidden"
            style={outerStyle}
            data-testid="weapon-replace-hub"
        >
            <div
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-30 flex flex-col items-center"
                style={{ fontFamily: "'Silkscreen', monospace" }}
            >
                <div className="bg-stone-950/85 border-2 border-amber-700 px-4 py-3 shadow-[0_4px_16px_rgba(0,0,0,0.7)] backdrop-blur-sm min-w-[260px]">
                    <div className="flex items-center gap-2 mb-2">
                        {request.weaponTexture && (
                            <img
                                src={request.weaponTexture}
                                alt=""
                                className="w-7 h-7 object-contain"
                                style={{ imageRendering: 'pixelated' }}
                            />
                        )}
                        <div className="flex flex-col">
                            <span className="text-[9px] text-amber-500 uppercase tracking-widest">
                                Hotbar Full
                            </span>
                            <span className="text-xs font-bold text-amber-200 leading-tight">
                                Pick up {request.weaponName}?
                            </span>
                        </div>
                    </div>

                    <div className="text-[9px] text-stone-400 mb-2">
                        Press a number to replace that slot. Locked (专武)
                        slots are disabled.
                    </div>

                    <div className="flex gap-1.5 justify-center">
                        {Array.from({ length: request.weaponMax }, (_, i) => {
                            const slot = request.slots[i];
                            const locked = request.lockedSlots[i] === true;
                            const isEmpty = slot === null;
                            return (
                                <button
                                    key={i}
                                    type="button"
                                    disabled={locked}
                                    onClick={() => handleClick(i)}
                                    className={`flex flex-col items-center justify-center w-14 h-16 border-2 transition-colors ${
                                        locked
                                            ? 'border-stone-800 bg-stone-900/40 opacity-40 cursor-not-allowed'
                                            : isEmpty
                                              ? 'border-stone-700 bg-stone-900/60 hover:border-amber-500 cursor-pointer'
                                              : 'border-stone-700 bg-stone-900/60 hover:border-amber-500 cursor-pointer'
                                    }`}
                                >
                                    <span className="text-[10px] font-bold text-amber-300">
                                        {SLOT_KEYS[i]?.label ?? `${i + 1}`}
                                    </span>
                                    {isEmpty ? (
                                        <span className="text-[8px] text-stone-500 mt-1">Empty</span>
                                    ) : (
                                        <>
                                            {slot?.texture && (
                                                <img
                                                    src={slot.texture}
                                                    alt=""
                                                    className="w-6 h-6 object-contain mt-0.5"
                                                    style={{ imageRendering: 'pixelated' }}
                                                />
                                            )}
                                            <span className="text-[7px] text-stone-400 mt-0.5 truncate max-w-[50px]">
                                                {slot?.name ?? ''}
                                            </span>
                                        </>
                                    )}
                                    {locked && (
                                        <span className="text-[7px] text-amber-600 uppercase tracking-wider">
                                            Locked
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};
