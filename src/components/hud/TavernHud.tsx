/**
 * src/components/hud/TavernHud.tsx
 * --------------------------------------------------------------------------
 * React HUD shown during the Forest Tavern scene.
 *
 * Performance & UI Fixes:
 * 1. 0 Reflow / Layout Repaint: Uses `translate3d` on GPU composite layer.
 * 2. EventBus Event Throttling: Prevents unnecessary React Re-renders.
 * 3. Exact 1.5s Hold-F Meter: Precise 396px path perimeter matches 1.5s keyframe.
 * 4. Pixel-perfect 1px Border: SVG stroke width mapped to match A/D 1px border.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Heart, Zap, Swords, Wind, Shield, Sparkles } from 'lucide-react';

import { EventBus } from '@/lib/events/bus';
import type { TavernFocusPayload } from '@/game/scenes/tavern-controller';
import { useHudScale } from '@/lib/use-hud-scale';
import { CornerPixels, RETRO_BOX } from './retro-box';

// ─── Stat bar ─────────────────────────────────────────────────────────────

interface StatBarProps {
    icon: React.ReactNode;
    label: string;
    value: number; // 1–10
    color: string;
}

const StatBar: React.FC<StatBarProps> = React.memo(({ icon, label, value, color }) => (
    <div className="flex items-center gap-1.5">
        <span className={`w-3.5 h-3.5 shrink-0 ${color}`}>{icon}</span>
        <span className="text-[9px] text-stone-400 uppercase tracking-widest w-12 shrink-0">
            {label}
        </span>
        <div className="flex gap-0.5">
            {Array.from({ length: 10 }, (_, i) => (
                <span
                    key={i}
                    className={`w-2 h-2 border ${i < value
                        ? `${color.replace('text-', 'bg-')} border-transparent`
                        : 'bg-stone-800 border-stone-700'
                        }`}
                />
            ))}
        </div>
        <span className="text-[9px] text-stone-400 ml-1">{value}/10</span>
    </div>
));

// ─── Mini bar ─────────────────────────────────────────────────────────────

interface MiniBarProps {
    icon: React.ReactNode;
    value: number;
    fillClass: string;
    label: string;
}

const MiniBar: React.FC<MiniBarProps> = React.memo(({ icon, value, fillClass, label }) => (
    <div className="flex items-center gap-1.5">
        <span className="w-3.5 h-3.5 shrink-0">{icon}</span>
        <div className="flex-1 h-2 bg-black border border-stone-700 relative">
            <div
                className={`h-full ${fillClass} transition-all duration-300`}
                style={{ width: `${Math.min(100, (value / 200) * 100)}%` }}
            />
            <span className="absolute inset-0 flex items-center justify-end pr-1 text-[8px] font-bold text-white leading-none drop-shadow-[1px_1px_0px_#000]">
                {value}
            </span>
        </div>
        <span className="text-[9px] text-stone-500 w-8">{label}</span>
    </div>
));

// ─── Check content equality ───────────────────────────────────────────────

function isSameFocusContent(a: TavernFocusPayload | null, b: TavernFocusPayload | null): boolean {
    if (a === b) return true;
    if (!a || !b) return false;

    if (
        a.phase !== b.phase ||
        a.name !== b.name ||
        a.hp !== b.hp ||
        a.sp !== b.sp ||
        a.weaponCount !== b.weaponCount ||
        a.weaponMax !== b.weaponMax
    ) {
        return false;
    }

    if (a.stats && b.stats) {
        return (
            a.stats.strength === b.stats.strength &&
            a.stats.agility === b.stats.agility &&
            a.stats.vitality === b.stats.vitality &&
            a.stats.spirit === b.stats.spirit
        );
    }

    return a.stats === b.stats;
}

// ─── DOM Direct Translation (0 Reflow / GPU acceleration) ───────────────

function applyWrapPosition(
    wrap: HTMLDivElement,
    payload: TavernFocusPayload | null,
    scale: number,
): void {
    const s = scale || 1;
    if (
        payload &&
        payload.phase === 'selection' &&
        payload.viewportX !== undefined &&
        payload.viewportY !== undefined
    ) {
        const lx = payload.viewportX / s;
        const ly = payload.viewportY / s;
        wrap.style.transform = `translate3d(${lx}px, ${ly}px, 0px) translate(-50%, -100%)`;
    } else if (payload) {
        const rx = 24 / s;
        wrap.style.transform = `translate3d(calc(100vw / ${s} - ${rx}px), -50%, 0px) translate(-100%, 0px)`;
    }
}

// ─── TavernHud Component ───────────────────────────────────────────────────

export const TavernHud: React.FC = () => {
    const [focus, setFocus] = useState<TavernFocusPayload | null>(null);
    const [holding, setHolding] = useState(false);

    const wrapRef = useRef<HTMLDivElement>(null);
    const focusRef = useRef<TavernFocusPayload | null>(null);

    const { scale, width, height } = useHudScale();
    const scaleRef = useRef(scale);

    useEffect(() => {
        scaleRef.current = scale;
        const wrap = wrapRef.current;
        if (wrap && focusRef.current) {
            applyWrapPosition(wrap, focusRef.current, scale);
        }
    }, [scale]);

    useEffect(() => {
        const handler = (payload: TavernFocusPayload | null) => {
            focusRef.current = payload;

            const wrap = wrapRef.current;
            if (wrap) {
                applyWrapPosition(wrap, payload, scaleRef.current);
            }

            const nextHolding =
                payload !== null &&
                payload.phase === 'selection' &&
                payload.holding === true;

            setHolding((prev) => (prev === nextHolding ? prev : nextHolding));

            setFocus((prev) => {
                if (isSameFocusContent(prev, payload)) return prev;
                return payload;
            });
        };

        EventBus.on('tavern-focus', handler);
        return () => EventBus.off('tavern-focus', handler);
    }, []);

    if (!focus) return null;

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

    const isSelection = focus.phase === 'selection';

    return (
        <div className="pointer-events-none [&>*]:pointer-events-none select-none cursor-none overflow-hidden" style={outerStyle}>
            {/* Precise 396px-perimeter close animation, 1.5s */}
            <style>{`
                @keyframes tavern-f-fill {
                    from {
                        stroke-dashoffset: 396;
                    }
                    to {
                        stroke-dashoffset: 0;
                    }
                }
                .f-holding {
                    animation: tavern-f-fill 1.5s linear forwards !important;
                }
            `}</style>

            <div
                ref={wrapRef}
                className="absolute left-0 top-0 z-20 flex flex-col items-center will-change-transform"
                style={{
                    fontFamily: "'Silkscreen', monospace",
                }}
            >
                <div className="tavern-hud-bob flex flex-col items-center">
                    <div className={`${RETRO_BOX} relative p-4 w-[280px]`}>
                        <CornerPixels hideBottom={isSelection} />

                        {/* Phase label */}
                        <div className="flex items-center gap-2 mb-3 pb-1.5 border-b-2 border-amber-900/60">
                            <div className="w-2 h-2 bg-amber-400 border border-black animate-pulse shrink-0" />
                            <span className="text-[9px] text-amber-500 uppercase tracking-widest">
                                {isSelection ? 'Select Character' : 'Pick Up Weapons'}
                            </span>
                        </div>

                        {isSelection ? (
                            /* ── Phase 1: Character info ── */
                            <>
                                {/* Name */}
                                <div className="text-sm font-bold text-amber-200 uppercase tracking-wider mb-3 drop-shadow-[1px_1px_0px_#000]">
                                    {focus.name}
                                </div>

                                {/* HP / SP */}
                                <div className="flex flex-col gap-1.5 mb-3">
                                    <MiniBar
                                        icon={<Heart className="w-3.5 h-3.5 fill-red-500 text-red-400" />}
                                        value={focus.hp}
                                        fillClass="bg-red-600"
                                        label="HP"
                                    />
                                    <MiniBar
                                        icon={<Zap className="w-3.5 h-3.5 fill-sky-400 text-sky-300" />}
                                        value={focus.sp}
                                        fillClass="bg-sky-500"
                                        label="SP"
                                    />
                                </div>

                                {/* Stats */}
                                {focus.stats && (
                                    <div className="flex flex-col gap-1.5 mb-4">
                                        <StatBar
                                            icon={<Swords className="w-3.5 h-3.5" />}
                                            label="STR"
                                            value={focus.stats.strength}
                                            color="text-red-400"
                                        />
                                        <StatBar
                                            icon={<Wind className="w-3.5 h-3.5" />}
                                            label="AGI"
                                            value={focus.stats.agility}
                                            color="text-emerald-400"
                                        />
                                        <StatBar
                                            icon={<Shield className="w-3.5 h-3.5" />}
                                            label="VIT"
                                            value={focus.stats.vitality}
                                            color="text-amber-400"
                                        />
                                        <StatBar
                                            icon={<Sparkles className="w-3.5 h-3.5" />}
                                            label="SPI"
                                            value={focus.stats.spirit}
                                            color="text-purple-400"
                                        />
                                    </div>
                                )}

                                {/* Keyboard hints */}
                                <div className="flex flex-col gap-1 pt-2 border-t border-stone-800">
                                    <div className="flex items-center gap-2 text-[9px] text-stone-500">
                                        <span className="px-1 py-0.5 bg-stone-800 border border-stone-600 text-stone-300">A</span>
                                        <span>/</span>
                                        <span className="px-1 py-0.5 bg-stone-800 border border-stone-600 text-stone-300">D</span>
                                        <span>Cycle</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-[9px] text-amber-400">
                                        {/* F-key cap: matches A/D's px-1 py-0.5 + default border-amber-900 1px border */}
                                        <span className="relative inline-flex items-center justify-center px-1 py-0.5 bg-amber-900/40 border border-amber-900 text-amber-300 leading-none">
                                            F
                                            {/* Charge-progress SVG: precise 1px overlap */}
                                            <svg
                                                className="absolute -inset-[1px] w-[calc(100%+2px)] h-[calc(100%+2px)] pointer-events-none overflow-visible"
                                                viewBox="0 0 100 100"
                                                preserveAspectRatio="none"
                                                aria-hidden="true"
                                            >
                                                <path
                                                    className={holding ? 'f-holding' : undefined}
                                                    d="M 0.5 0.5 L 99.5 0.5 L 99.5 99.5 L 0.5 99.5 Z"
                                                    fill="none"
                                                    stroke="#fbbf24"
                                                    strokeWidth="4"
                                                    strokeDasharray="396"
                                                    strokeDashoffset="396"
                                                />
                                            </svg>
                                        </span>
                                        <span>Confirm (hold 1.5s)</span>
                                    </div>
                                </div>
                            </>
                        ) : (
                            /* ── Phase 2: Weapon pickup ── */
                            <>
                                <div className="text-xs font-bold text-amber-200 mb-3">
                                    Selected: <span className="text-amber-400">{focus.name}</span>
                                </div>

                                {/* Weapon count */}
                                <div className="mb-3">
                                    <div className="text-[9px] text-stone-400 mb-1.5">Weapon Slots</div>
                                    <div className="flex gap-2">
                                        {Array.from({ length: focus.weaponMax }, (_, i) => (
                                            <div
                                                key={i}
                                                className={`w-10 h-10 border-2 flex items-center justify-center ${i < focus.weaponCount
                                                    ? 'border-amber-500 bg-amber-900/40'
                                                    : 'border-stone-700 bg-stone-900/40'
                                                    }`}
                                            >
                                                {i < focus.weaponCount && (
                                                    <Swords className="w-4 h-4 text-amber-400" />
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                    <div className="text-[9px] text-stone-500 mt-1">
                                        {focus.weaponCount}/{focus.weaponMax} · max {focus.weaponMax} weapons
                                    </div>
                                </div>

                                {/* Exit hint */}
                                <div className="pt-2 border-t border-stone-800 text-[9px] text-emerald-400">
                                    ↑ Walk to the teleporter to enter Stage 1
                                </div>
                            </>
                        )}
                    </div>
                    {isSelection && (
                        <svg
                            width="14"
                            height="9"
                            viewBox="0 0 14 9"
                            shapeRendering="crispEdges"
                            className="drop-shadow-[1px_1px_0px_#000] -mt-px"
                            aria-hidden="true"
                        >
                            <polygon points="0,0 14,0 7,9" fill="#1c1917" />
                            <polygon points="1,1 13,1 7,8" fill="#fbbf24" />
                        </svg>
                    )}
                </div>
            </div>
        </div>
    );
};