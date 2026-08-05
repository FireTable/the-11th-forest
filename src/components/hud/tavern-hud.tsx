/**
 * src/components/hud/tavern-hud.tsx
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
import { Heart, Zap, Swords, Gauge, Layers } from 'lucide-react';

import { EventBus } from '@/lib/events/bus';
import type { TavernFocusPayload } from '@/game/scenes/tavern-controller';
import { useHudScale } from '@/lib/use-hud-scale';
import { CornerPixels, RETRO_BOX } from './retro-box';

// ─── Stat row (icon + label + value) ─────────────────────────────────────

/**
 * Convert a `CharacterSpec.moveSpeed` (Matter velocity unit — pixels
 * per 16.67ms step at 60Hz) into a human-readable m/s value.
 *
 *   moveSpeed 5  →  5 px/step × 60 step/s  =  300 px/s
 *   300 px/s ÷ 150 px/m                    =    2 m/s  (brisk walk)
 *   moveSpeed 4  →  240 px/s ÷ 150         =  1.6 m/s (normal walk)
 *
 * 150 px ≈ 1 m gives real-world walking pace. forest-path map is
 * 2752 px wide → ~18 m, traversable in ~14–17 s at the slower chars.
 */
const PX_PER_METER = 150;
const STEPS_PER_SEC = 60;
const moveSpeedToMps = (moveSpeed: number): string =>
    ((moveSpeed * STEPS_PER_SEC) / PX_PER_METER).toFixed(1);
/** SP regen time (ms → s, 1 decimal). spRegenMs is "0→max refill time". */
const spRegenToSec = (spRegenMs: number): string => (spRegenMs / 1000).toFixed(1);

interface StatRowProps {
    icon: React.ReactNode;
    label: string;
    value: number | string;
    /** Optional unit suffix, e.g. "/10" or "px/s". */
    suffix?: string;
    /** Optional secondary value, e.g. SP regen next to SP cap. */
    subValue?: string;
    color: string;
}

const StatRow: React.FC<StatRowProps> = React.memo(
    ({ icon, label, value, suffix, subValue, color }) => (
        <div className="flex items-center justify-between">
            {/* Icon + label group, packed tight (no fixed-width columns
                so the icon sits flush against its label). */}
            <div className="flex items-center gap-1 shrink-0">
                <span className={`${color} flex items-center`}>{icon}</span>
                <span
                    className={`uppercase tracking-widest shrink-0 text-[9px] text-stone-200`}
                >
                    {label}
                </span>
            </div>
            <span
                className={`font-mono tabular-nums leading-none drop-shadow-[1px_1px_0px_#000] text-[10px] text-stone-300`}
            >
                {value}
                {suffix && <span className="text-stone-500 text-[8px] ml-1">{suffix}</span>}
                {subValue && (
                    <span className="text-stone-500 text-[8px] ml-1">
                        / {subValue}
                    </span>
                )}
            </span>
        </div>
    ),
);

// ─── Radar polygon (stats vs max across all characters) ──────────────────

interface RadarPoint {
    /** Current value for the focused character. */
    value: number;
    /** Lowest value across every character (inner ring). */
    min: number;
    /** Highest value across every character (outer ring). */
    max: number;
    /** Display label for the vertex (rendered outside the polygon). */
    label: string;
    /** Icon for the axis label (rendered via foreignObject). */
    icon: React.ReactNode;
    /** Tailwind color class applied to the icon (e.g. "text-red-400"). */
    iconColor: string;
}

interface RadarPolygonProps {
    points: RadarPoint[];
    /** Pixel size of the SVG (square). */
    size?: number;
    /** Stroke + fill colour for the focused character's polygon. */
    color?: string;
}

/** Inner ring sits at this fraction of the radius — the weakest
 *  character's stat lands here instead of at the centre. Lifted
 *  above the centre so the focused character's polygon has visible
 *  area even when 3+ stats are at the floor (otherwise Wanderer's
 *  1-of-4 strong profile collapses to a thin sliver). */
const FLOOR_RATIO = 0.35;

/** Map a per-vertex value to [0, 1] where 0 = chart centre and 1 =
 *  outer ring. Values are normalised over [min, max], then re-mapped
 *  so that `min` lands at FLOOR_RATIO of the radius (not at the
 *  centre) and `max` lands at the outer ring. Falls back to 0.5
 *  when all characters share the same stat. */
const scaleFor = (p: RadarPoint): number => {
    if (p.max <= p.min) return 0.5;
    const ratio = (p.value - p.min) / (p.max - p.min);
    return FLOOR_RATIO + ratio * (1 - FLOOR_RATIO);
};

/**
 * 4-axis radar chart. The inner ring sits at FLOOR_RATIO of the
 * radius (where the weakest character's stat lands), the outer
 * ring at the strongest. Vertex distance is `FLOOR_RATIO + (value
 * − min) / (max − min) * (1 − FLOOR_RATIO)` so the polygon never
 * collapses to the centre. A faint half-way cross-hair marks the
 * 50% reference. The filled polygon shows the focused character's
 * profile. Each axis label is its lucide icon (rendered inside a
 * foreignObject) plus the stat name.
 */
const RadarPolygon: React.FC<RadarPolygonProps> = React.memo(
    ({ points, size = 120, color = '#fbbf24' }) => {
        const cx = size / 2;
        const cy = size / 2;
        const radius = size / 2 - 22;
        const n = points.length;
        // 4 axes evenly spaced starting at top (12 o'clock): top,
        // right, bottom, left.
        const angleAt = (i: number): number => -Math.PI / 2 + (i * 2 * Math.PI) / n;
        const vertex = (i: number, scale: number): { x: number; y: number } => {
            const a = angleAt(i);
            return { x: cx + Math.cos(a) * radius * scale, y: cy + Math.sin(a) * radius * scale };
        };

        // Inner ring drawn at FLOOR_RATIO (= where the weakest
        // character's stat lands). Drawn faint so it reads as the
        // floor, not as a hard limit.
        const innerRing = points
            .map((_, i) => {
                const v = vertex(i, FLOOR_RATIO);
                return `${v.x},${v.y}`;
            })
            .join(' ');

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

        // Focused character's polygon (vertex distance via [min, max])
        const focusPolygon = points
            .map((p, i) => {
                const v = vertex(i, scaleFor(p));
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
                {/* Inner ring (min, weakest character) */}
                <polygon
                    points={innerRing}
                    fill="none"
                    stroke="#1c1917"
                    strokeWidth="1"
                    strokeDasharray="2 2"
                />
                {/* Outer ring (max, strongest character) */}
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
                    const v = vertex(i, scaleFor(p));
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
                {/* Axis labels — icon + stat name, sit just outside the
                    outer ring. foreignObject lets us embed lucide SVG
                    icons (which are React components) inside the radar
                    SVG without copying each path manually. */}
                {points.map((p, i) => {
                    const lp = vertex(i, 1.22);
                    return (
                        <foreignObject
                            key={i}
                            x={lp.x - 14}
                            y={lp.y - 7}
                            width="28"
                            height="14"
                        >
                            <div className="flex items-center justify-center gap-0.5 text-[6px] leading-none font-mono text-stone-300">
                                <span className={`${p.iconColor} flex items-center`}>
                                    {p.icon}
                                </span>
                                <span>{p.label}</span>
                            </div>
                        </foreignObject>
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
        a.spRegenMs !== b.spRegenMs ||
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
            aStats.hp === bStats.hp &&
            aStats.sp === bStats.sp &&
            aStats.moveSpeed === bStats.moveSpeed &&
            aStats.weaponMax === bStats.weaponMax);
    if (!statsEq) return false;

    const aRange = a.statRange;
    const bRange = b.statRange;
    const rangeEq =
        (!aRange && !bRange) ||
        (!!aRange &&
            !!bRange &&
            aRange.hp.min === bRange.hp.min &&
            aRange.hp.max === bRange.hp.max &&
            aRange.sp.min === bRange.sp.min &&
            aRange.sp.max === bRange.sp.max &&
            aRange.moveSpeed.min === bRange.moveSpeed.min &&
            aRange.moveSpeed.max === bRange.moveSpeed.max &&
            aRange.weaponMax.min === bRange.weaponMax.min &&
            aRange.weaponMax.max === bRange.weaponMax.max);
    return rangeEq;
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
                                <div className="flex gap-5 mb-3">
                                    {/* Left column: numerical stats with icons */}
                                    <div className="flex flex-col justify-center gap-2.5 flex-1 min-w-0">
                                        <StatRow
                                            icon={<Heart className="w-3.5 h-3.5 fill-red-500 text-red-400" />}
                                            label="HP"
                                            value={focus.hp}
                                            color="text-red-400"
                                        />
                                        <StatRow
                                            icon={<Zap className="w-3.5 h-3.5 fill-sky-400 text-sky-300" />}
                                            label="SP"
                                            value={focus.sp}
                                            subValue={`${spRegenToSec(focus.spRegenMs)}s`}
                                            color="text-sky-400"
                                        />
                                        <StatRow
                                            icon={<Gauge className="w-3.5 h-3.5" />}
                                            label="SPD"
                                            value={moveSpeedToMps(focus.moveSpeed)}
                                            suffix="m/s"
                                            color="text-emerald-400"
                                        />
                                        <StatRow
                                            icon={<Layers className="w-3.5 h-3.5" />}
                                            label="SLT"
                                            value={focus.weaponMax}
                                            suffix="max"
                                            color="text-orange-300"
                                        />
                                    </div>

                                    {/* Right column: radar polygon */}
                                    {focus.stats && focus.statRange && (
                                        <div className="shrink-0 items-center">
                                            <RadarPolygon
                                                points={[
                                                    {
                                                        value: focus.stats.hp,
                                                        min: focus.statRange.hp.min,
                                                        max: focus.statRange.hp.max,
                                                        label: 'HP',
                                                        icon: <Heart className="w-2.5 h-2.5" />,
                                                        iconColor: 'text-red-400',
                                                    },
                                                    {
                                                        value: focus.stats.sp,
                                                        min: focus.statRange.sp.min,
                                                        max: focus.statRange.sp.max,
                                                        label: 'SP',
                                                        icon: <Zap className="w-2.5 h-2.5" />,
                                                        iconColor: 'text-sky-400',
                                                    },
                                                    {
                                                        value: focus.stats.moveSpeed,
                                                        min: focus.statRange.moveSpeed.min,
                                                        max: focus.statRange.moveSpeed.max,
                                                        label: 'SPD',
                                                        icon: <Gauge className="w-2.5 h-2.5" />,
                                                        iconColor: 'text-emerald-400',
                                                    },
                                                    {
                                                        value: focus.stats.weaponMax,
                                                        min: focus.statRange.weaponMax.min,
                                                        max: focus.statRange.weaponMax.max,
                                                        label: 'SLT',
                                                        icon: <Layers className="w-2.5 h-2.5" />,
                                                        iconColor: 'text-orange-300',
                                                    },
                                                ]}
                                                size={110}
                                            />
                                        </div>
                                    )}
                                </div>

                                <div className="flex flex-col gap-1 my-4 border-t border-stone-300/90" />

                                {/* Keyboard hints */}
                                <div className="flex flex-col gap-2">
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