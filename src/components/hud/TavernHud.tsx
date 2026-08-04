/**
 * src/components/hud/TavernHud.tsx
 * --------------------------------------------------------------------------
 * React HUD shown during the Forest Tavern scene.
 *
 * Phase 1 (selection): Shows the focused NPC's name, HP/SP, move speed,
 *   and four display-only stats (strength / agility / vitality / spirit)
 *   as 1–10 star bars. Keyboard hints: A/D to cycle, F (long-press 1.5s)
 *   or double-click to confirm.
 *
 * Phase 2 (pickup): Shows weapon count / max and "walk to exit" hint.
 *
 * Data arrives via EventBus 'tavern-focus' events emitted by TavernController.
 * The component is lazily mounted from App.tsx only while the tavern scene
 * is active (tavernCleared === false).
 *
 * The HUD self-scales through `useHudScale` (same hook GameHUDLayer
 * uses), so panels, weapon slots, etc. shrink together on small screens.
 * The scaled outer wrapper uses layout-space coordinates
 * (`width / scale` × `height / scale`); viewport pixels from Phaser are
 * divided by `scale` before being written to the wrap's DOM.
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

const StatBar: React.FC<StatBarProps> = ({ icon, label, value, color }) => (
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
);

// ─── HP / SP mini bar ─────────────────────────────────────────────────────

interface MiniBarProps {
    icon: React.ReactNode;
    value: number;
    fillClass: string;
    label: string;
}

const MiniBar: React.FC<MiniBarProps> = ({ icon, value, fillClass, label }) => (
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
);

// ─── Position apply (shared by event handler + scale-change effect) ───────

/**
 * Position the wrap inside the scaled outer wrapper. The wrapper's
 * layout space is `viewport / scale`, so viewport pixels must be
 * divided by `scale` before being written to the wrap.
 */
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
        // Position only — the bobbing is CSS (`tavern-hud-bob`), not JS.
        // This handler only fires on selection change (the controller's
        // per-frame emit is content-stable so React short-circuits it),
        // so we don't burn a style recalc per frame anymore.
        wrap.style.left = `${payload.viewportX / s}px`;
        wrap.style.top = `${payload.viewportY / s}px`;
        wrap.style.right = 'auto';
        wrap.style.transform = `translate(-50%, -100%)`;
    } else if (payload) {
        // Phase 2: right-rail anchor, also in layout space.
        wrap.style.left = '';
        wrap.style.top = '';
        wrap.style.right = `${24 / s}px`;
        wrap.style.transform = 'translateY(-50%)';
    }
}

// ─── TavernHud ─────────────────────────────────────────────────────────────

export const TavernHud: React.FC = () => {
    const [focus, setFocus] = useState<TavernFocusPayload | null>(null);
    const wrapRef = useRef<HTMLDivElement>(null);
    const holdProgressRef = useRef<SVGRectElement>(null);
    const { scale, width, height } = useHudScale();
    const scaleRef = useRef(scale);

    useEffect(() => {
        scaleRef.current = scale;
    }, [scale]);

    // Re-apply positioning when the HUD scale changes. The wrap's
    // coords live in the scaled wrapper's layout space, so a scale
    // change must re-convert the viewport pixels.
    useEffect(() => {
        const wrap = wrapRef.current;
        if (wrap && focus) applyWrapPosition(wrap, focus, scale);
    }, [scale, focus]);

    useEffect(() => {
        const handler = (payload: TavernFocusPayload | null) => {
            // ── High-frequency position: write straight to the DOM.
            //    Avoids a React re-render per arrow-bob frame (the
            //    controller emits every frame in phase 1).
            const wrap = wrapRef.current;
            if (wrap) applyWrapPosition(wrap, payload, scaleRef.current);

            // ── F-key hold progress: write the path's stroke-dashoffset so the
            //    amber border fills clockwise (top → right → bottom → left)
            //    from the cap's top-left corner. The path perimeter is
            //    392 viewBox units (98·4), so dashoffset runs 392 → 0.
            const holdEl = holdProgressRef.current;
            if (holdEl) {
                if (payload && payload.holdProgress !== undefined) {
                    holdEl.style.strokeDashoffset = String(
                        392 * (1 - payload.holdProgress),
                    );
                } else {
                    holdEl.style.strokeDashoffset = '392';
                }
            }

            // ── Low-frequency content: only re-render when it actually
            //    changes. Phase 1 bobbing keeps `name`/`hp`/etc identical
            //    across frames, so we skip the render and let the DOM
            //    write above carry the motion.
            setFocus((prev) => {
                if (!payload) return payload;
                if (
                    prev &&
                    prev.phase === payload.phase &&
                    prev.name === payload.name &&
                    prev.hp === payload.hp &&
                    prev.sp === payload.sp &&
                    prev.weaponCount === payload.weaponCount
                ) {
                    return prev;
                }
                return payload;
            });
        };
        EventBus.on('tavern-focus', handler);
        return () => EventBus.off('tavern-focus', handler);
    }, []);

    // Scaled outer wrapper — same pattern as GameHUDLayer. Children
    // write coords in layout space (`width / scale` × `height / scale`);
    // the wrapper scales them back up to viewport size.
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

    if (!focus) return null;

    const isSelection = focus.phase === 'selection';

    return (
        <div style={outerStyle}>
            <div
                ref={wrapRef}
                className="absolute z-20 flex flex-col items-center pointer-events-none select-none"
                style={{
                    fontFamily: "'Silkscreen', monospace",
                    right: '24px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                }}
            >
                {/* `.tavern-hud-bob` runs the float on the GPU; the
                    outer `wrapRef` only receives a transform write on
                    selection change. */}
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
                                    <span className="relative inline-flex">
                                        <span className="relative px-1 py-0.5 bg-amber-900/40 border border-amber-700 text-amber-300">
                                            F
                                            {/* Hold-progress overlay: amber-400
                                                stroke that traces the cap's
                                                perimeter clockwise (top →
                                                right → bottom → left) as F is
                                                held. `pathLength="100"`
                                                normalises the perimeter; the
                                                controller writes `strokeDashoffset`
                                                per frame (100 - progress·100). */}
                                            <svg
                                                className="absolute inset-0 w-full h-full pointer-events-none overflow-visible"
                                                viewBox="0 0 100 100"
                                                preserveAspectRatio="none"
                                                aria-hidden="true"
                                            >
                                                {/* Clockwise trace around the cap:
                                                   (1,1) → (99,1) → (99,99) → (1,99).
                                                   Perimeter = 98·4 = 392 viewBox
                                                   units; the controller writes
                                                   `strokeDashoffset` per frame as
                                                   `392 · (1 - progress)` so the
                                                   amber stroke fills the cap's
                                                   border clockwise from the
                                                   top-left corner. */}
                                                <path
                                                    ref={holdProgressRef}
                                                    d="M 1 1 L 99 1 L 99 99 L 1 99 Z"
                                                    fill="none"
                                                    stroke="#fbbf24"
                                                    strokeWidth="3"
                                                    strokeDasharray="392"
                                                    strokeDashoffset="392"
                                                    vectorEffect="non-scaling-stroke"
                                                />
                                            </svg>
                                        </span>
                                    </span>
                                    <span>Confirm (1.5s)</span>
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
                    /* Pixel-art downward triangle. Matches the box's amber/dark
                       chrome: 1px stone-900 outline + amber-400 fill, with
                       crispEdges so the sloped sides stay pixelated (no
                       anti-alias smoothing). Rides the HUD's `arrowOffsetY`
                       bob via the container's transform. */
                    <svg
                        width="14"
                        height="9"
                        viewBox="0 0 14 9"
                        shapeRendering="crispEdges"
                        className="drop-shadow-[1px_1px_0px_#000] -mt-px"
                        aria-hidden="true"
                    >
                        {/* Stone-900 outline (full triangle). */}
                        <polygon points="0,0 14,0 7,9" fill="#1c1917" />
                        {/* Amber-400 fill inset 1px on each side. */}
                        <polygon points="1,1 13,1 7,8" fill="#fbbf24" />
                    </svg>
                )}
                </div>
            </div>
        </div>
    );
};