/**
 * src/components/hud/TavernHud.tsx
 * --------------------------------------------------------------------------
 * React HUD shown during the Forest Tavern scene.
 *
 * Layout (Phase 1 — character selection):
 *   - Character name
 *   - Description (free-form text from spec)
 *   - Stats grid (HP / SP / MoveSpeed + STR / AGI / VIT / SPI) shown
 *     as icon + value, no fill bars
 *   - Radar polygon: each stat vertex sits at current/max on its
 *     axis, so the player can read the character's profile against
 *     the strongest character for each stat
 *   - Keyboard hints (A/D cycle, F hold-to-confirm with charge
 *     progress SVG)
 *
 * Layout (Phase 2 — weapon pickup): unchanged weapon-slot grid.
 *
 * Performance:
 *   1. Position pinned via direct DOM transform (translate3d on GPU
 *      composite layer), no React re-render for the position path.
 *   2. EventBus event throttling: tavern-focus content equality check
 *      keeps React state stable when only the holding flag flips.
 *   3. Exact 1.5s Hold-F Meter: precise 396px perimeter path matches
 *      the CSS keyframe duration.
 *   4. Pixel-perfect 1px border on key chips via min-w + inline-flex
 *      centering.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Heart, Zap, Swords, Wind, Shield, Sparkles, Gauge } from 'lucide-react';

import { EventBus } from '@/lib/events/bus';
import type { TavernFocusPayload } from '@/game/scenes/tavern-controller';
import { useHudScale } from '@/lib/use-hud-scale';
import { CornerPixels, RETRO_BOX } from './retro-box';

// ─── Stat row (icon + label + value) ─────────────────────────────────────

interface StatRowProps {
    icon: React.ReactNode;
    label: string;
    value: number | string;
    /** Optional unit suffix, e.g. "/10" or "px/s". */
    suffix?: string;
    color: string;
    /** Render the value bigger / different (used for HP / SP). */
    prominent?: boolean;
}

const StatRow: React.FC<StatRowProps> = React.memo(
    ({ icon, label, value, suffix, color, prominent }) => (
        <div className="flex items-center gap-1.5">
            <span className={`w-3.5 h-3.5 shrink-0 ${color}`}>{icon}</span>
            <span
                className={`uppercase tracking-widest shrink-0 ${
                    prominent
                        ? 'text-[11px] text-stone-200 w-10'
                        : 'text-[9px] text-stone-400 w-12'
                }`}
            >
                {label}
            </span>
            <span
                className={`font-mono tabular-nums leading-none drop-shadow-[1px_1px_0px_#000] ${
                    prominent
                        ? `text-[12px] ${color}`
                        : 'text-[10px] text-stone-200'
                }`}
            >
                {value}
                {suffix && <span className="text-stone-500 text-[8px] ml-0.5">{suffix}</span>}
            </span>
        </div>
    ),
);

// ─── Radar polygon (stats vs max across all characters) ──────────────────

interface RadarPoint {
    /** Current value for the focused character, 0–max. */
    value: number;
    /** Max value across every character, 0–max. */
    max: number;
    /** Display label for the vertex (rendered outside the polygon). */
    label: string;
}

interface RadarPolygonProps {
    points: RadarPoint[];
    /** Pixel size of the SVG (square). */
    size?: number;
    /** Stroke + fill colour for the focused character's polygon. */
    color?: string;
}

/**
 * 4-axis radar chart. Each axis starts at the centre, ends at the
 * outer ring. Vertex distance = (value / max) * outerRadius. The
 * outer ring is drawn at max (full extent), the inner axis
 * cross-hair at half-max (the 50% reference), and the filled
 * polygon shows the focused character's profile. Labels for each
 * axis float just outside the ring.
 */
const RadarPolygon: React.FC<RadarPolygonProps> = React.memo(
    ({ points, size = 88, color = '#fbbf24' }) => {
        const cx = size / 2;
        const cy = size / 2;
        const radius = size / 2 - 14;
        const n = points.length;
        // 4 axes evenly spaced starting at top (12 o'clock): top,
        // right, bottom, left.
        const angleAt = (i: number): number => -Math.PI / 2 + (i * 2 * Math.PI) / n;
        const vertex = (i: number, scale: number): { x: number; y: number } => {
            const a = angleAt(i);
            return { x: cx + Math.cos(a) * radius * scale, y: cy + Math.sin(a) * radius * scale };
        };

        // Outer ring (max reference)
        const outerRing = points
            .map((_, i) => {
                const p = vertex(i, 1);
                return `${p.x},${p.y}`;
            })
            .join(' ');

        // Half-radius cross-hair
        const halfRing = points
            .map((_, i) => {
                const p = vertex(i, 0.5);
                return `${p.x},${p.y}`;
            })
            .join(' ');

        // Focused character's polygon
        const focusPolygon = points
            .map((p, i) => {
                const scale = p.max > 0 ? Math.max(0, Math.min(1, p.value / p.max)) : 0;
                const v = vertex(i, scale);
                return `${v.x},${v.y}`;
            })
            .join(' ');

        return (
            <svg
                width={size}
                height={size}
                viewBox={`0 0 ${size} ${size}`}
                shapeRendering="geometricPrecision"
                aria-hidden="true"
            >
                {/* Outer ring (max) */}
                <polygon
                    points={outerRing}
                    fill="none"
                    stroke="#44403c"
                    strokeWidth="1"
                />
                {/* Half ring (50%) */}
                <polygon
                    points={halfRing}
                    fill="none"
                    stroke="#1c1917"
                    strokeWidth="1"
                    strokeDasharray="2 2"
                />
                {/* Axis lines */}
                {points.map((_, i) => {
                    const p = vertex(i, 1);
                    return (
                        <line
                            key={i}
                            x1={cx}
                            y1={cy}
                            x2={p.x}
                            y2={p.y}
                            stroke="#1c1917"
                            strokeWidth="1"
                        />
                    );
                })}
                {/* Focused polygon */}
                <polygon
                    points={focusPolygon}
                    fill={color}
                    fillOpacity="0.25"
                    stroke={color}
                    strokeWidth="1.5"
                />
                {/* Vertex dots */}
                {points.map((p, i) => {
                    const scale = p.max > 0 ? Math.max(0, Math.min(1, p.value / p.max)) : 0;
                    const v = vertex(i, scale);
                    return (
                        <circle
                            key={i}
                            cx={v.x}
                            cy={v.y}
                            r="1.6"
                            fill={color}
                        />
                    );
                })}
                {/* Axis labels — sit just outside the ring */}
                {points.map((p, i) => {
                    const lp = vertex(i, 1.18);
                    return (
                        <text
                            key={i}
                            x={lp.x}
                            y={lp.y}
                            fontSize="6"
                            fontFamily="'Silkscreen', monospace"
                            fill="#a8a29e"
                            textAnchor="middle"
                            dominantBaseline="middle"
                        >
                            {p.label}
                        </text>
                    );
                })}
            </svg>
        );
    },
);

// ─── Content equality check ───────────────────────────────────────────────

function isSameFocusContent(a: TavernFocusPayload | null, b: TavernFocusPayload | null): boolean {
    if (a === b) return true;
    if (!a || !b) return false;

    if (
        a.phase !== b.phase ||
        a.name !== b.name ||
        a.hp !== b.hp ||
        a.sp !== b.sp ||
        a.weaponCount !== b.weaponCount ||
        a.weaponMax !== b.weaponMax ||
        a.description !== b.description
    ) {
        return false;
    }

    const aStats = a.stats;
    const bStats = b.stats;
    const statsEq =
        (!aStats && !bStats) ||
        (!!aStats &&
            !!bStats &&
            aStats.strength === bStats.strength &&
            aStats.agility === bStats.agility &&
            aStats.vitality === bStats.vitality &&
            aStats.spirit === bStats.spirit);
    if (!statsEq) return false;

    const aMax = a.maxStats;
    const bMax = b.maxStats;
    const maxEq =
        (!aMax && !bMax) ||
        (!!aMax &&
            !!bMax &&
            aMax.strength === bMax.strength &&
            aMax.agility === bMax.agility &&
            aMax.vitality === bMax.vitality &&
            aMax.spirit === bMax.spirit);
    return maxEq;
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
                    <div className={`${RETRO_BOX} relative p-4 w-[320px]`}>
                        <CornerPixels hideBottom={isSelection} />

                        {isSelection ? (
                            /* ── Phase 1: Character info ── */
                            <>
                                {/* Name */}
                                <div className="text-base font-bold text-amber-200 uppercase tracking-wider mb-1 drop-shadow-[1px_1px_0px_#000]">
                                    {focus.name}
                                </div>

                                {/* Description */}
                                {focus.description && (
                                    <div className="text-[10px] leading-snug text-stone-300/90 italic mb-3 pr-1">
                                        {focus.description}
                                    </div>
                                )}

                                {/* Stats grid: left column HP/SP/MoveSpeed,
                                    right column radar polygon + STR/AGI/VIT/SPI */}
                                <div className="flex gap-3 mb-3">
                                    {/* Left column: numerical stats with icons */}
                                    <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                                        <StatRow
                                            icon={<Heart className="w-3.5 h-3.5 fill-red-500 text-red-400" />}
                                            label="HP"
                                            value={focus.hp}
                                            color="text-red-400"
                                            prominent
                                        />
                                        <StatRow
                                            icon={<Zap className="w-3.5 h-3.5 fill-sky-400 text-sky-300" />}
                                            label="SP"
                                            value={focus.sp}
                                            color="text-sky-400"
                                            prominent
                                        />
                                        <StatRow
                                            icon={<Gauge className="w-3.5 h-3.5" />}
                                            label="SPD"
                                            value={focus.moveSpeed}
                                            suffix="px/s"
                                            color="text-emerald-400"
                                        />
                                    </div>

                                    {/* Right column: radar polygon */}
                                    {focus.stats && focus.maxStats && (
                                        <div className="shrink-0 self-center">
                                            <RadarPolygon
                                                points={[
                                                    { value: focus.stats.strength, max: focus.maxStats.strength, label: 'STR' },
                                                    { value: focus.stats.agility, max: focus.maxStats.agility, label: 'AGI' },
                                                    { value: focus.stats.vitality, max: focus.maxStats.vitality, label: 'VIT' },
                                                    { value: focus.stats.spirit, max: focus.maxStats.spirit, label: 'SPI' },
                                                ]}
                                            />
                                        </div>
                                    )}
                                </div>

                                {/* Stats as text rows under the radar (icon +
                                    value) — duplicates radar visually but
                                    reads as plain numbers. Stripped when
                                    radar absent. */}
                                {focus.stats && (
                                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 mb-3 pt-2 border-t border-stone-800">
                                        <StatRow
                                            icon={<Swords className="w-3.5 h-3.5" />}
                                            label="STR"
                                            value={focus.stats.strength}
                                            suffix="/10"
                                            color="text-red-400"
                                        />
                                        <StatRow
                                            icon={<Wind className="w-3.5 h-3.5" />}
                                            label="AGI"
                                            value={focus.stats.agility}
                                            suffix="/10"
                                            color="text-emerald-400"
                                        />
                                        <StatRow
                                            icon={<Shield className="w-3.5 h-3.5" />}
                                            label="VIT"
                                            value={focus.stats.vitality}
                                            suffix="/10"
                                            color="text-amber-400"
                                        />
                                        <StatRow
                                            icon={<Sparkles className="w-3.5 h-3.5" />}
                                            label="SPI"
                                            value={focus.stats.spirit}
                                            suffix="/10"
                                            color="text-purple-400"
                                        />
                                    </div>
                                )}

                                {/* Keyboard hints */}
                                <div className="flex flex-col gap-1 pt-2 border-t border-stone-800">
                                    <div className="flex items-center gap-2 text-[9px] text-stone-500">
                                        <span className="inline-flex min-w-[18px] items-center justify-center px-1 py-0.5 bg-stone-800 border border-stone-600 text-stone-300">A</span>
                                        <span>/</span>
                                        <span className="inline-flex min-w-[18px] items-center justify-center px-1 py-0.5 bg-stone-800 border border-stone-600 text-stone-300">D</span>
                                        <span>Cycle</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-[9px] text-amber-400">
                                        <span className="relative inline-flex min-w-[18px] items-center justify-center px-1 py-0.5 bg-amber-900/40 border border-amber-900 text-amber-300">
                                            F
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
                                <div className="text-sm font-bold text-amber-200 mb-3">
                                    {focus.name}
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