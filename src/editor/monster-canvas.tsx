/**
 * src/editor/monster-canvas.tsx
 * --------------------------------------------------------------------------
 * Visual overlay for the editor's Monsters sub-tab. Renders each spawn
 * in `level.monsters` at its image-space (x, y) so the designer can see
 * the wave layout over the actual scene background. Each marker shows:
 *
 *   - a sprite thumbnail (first idle frame, scaled)
 *   - the wave id badge (color-coded per wave so multiple waves are
 *     easy to tell apart at a glance)
 *   - the monster's display name
 *
 * Read-only — coordinates are edited in the form list, not by dragging
 * markers. Active when `sceneSubTab === 'monsters'` so it doesn't draw
 * over the air-wall canvas.
 *
 * Scaling follows WallCanvas: measure the Phaser canvas's on-screen
 * rect, derive `scale = min(canvasW / imgW, canvasH / imgH)` (the same
 * math Phaser Scale.FIT uses), and multiply image px by it.
 */

import { useEffect, useMemo, useRef, useState } from 'react';

import { EventBus } from '@/lib/events/bus';
import type { Level, MonsterSpawn } from '@/lib/levels/types';

interface MonsterTypeInfo {
    id: string;
    name: string;
    texture: string;
    cols: number;
    idleCount: number;
    idleFrameRate: number;
}

interface Props {
    level: Level;
    active?: boolean;
    /** Called when the user drags a marker to a new (x, y). The index
     *  identifies which spawn moved (matches `level.monsters` order). */
    onSpawnMove?: (index: number, x: number, y: number) => void;
}

interface StageBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

const MARKER_W = 56;

const WAVE_PALETTE = [
    'border-cyan-400 bg-cyan-500/15 text-cyan-200',
    'border-fuchsia-400 bg-fuchsia-500/15 text-fuchsia-200',
    'border-amber-400 bg-amber-500/15 text-amber-200',
    'border-emerald-400 bg-emerald-500/15 text-emerald-200',
    'border-rose-400 bg-rose-500/15 text-rose-200',
    'border-violet-400 bg-violet-500/15 text-violet-200',
] as const;

export function MonsterCanvas({ level, active = true, onSpawnMove }: Props) {
    const wrapperRef = useRef<HTMLDivElement | null>(null);
    const [box, setBox] = useState<StageBox>({ x: 0, y: 0, width: 0, height: 0 });
    const [types, setTypes] = useState<MonsterTypeInfo[]>([]);

    useEffect(() => {
        fetch('/api/editor/list-monster-types')
            .then((r) => r.json())
            .then((b) => {
                const arr = Array.isArray(b.types) ? b.types : [];
                setTypes(
                    arr.map((t: unknown): MonsterTypeInfo => {
                        if (typeof t === 'string') {
                            return {
                                id: t,
                                name: t,
                                texture: `assets/image/monsters/${t}.png`,
                                cols: 4,
                                idleCount: 4,
                                idleFrameRate: 6,
                            };
                        }
                        const o = t as Partial<MonsterTypeInfo>;
                        return {
                            id: o.id ?? '',
                            name: o.name ?? o.id ?? '',
                            texture:
                                o.texture ?? `assets/image/monsters/${o.id ?? 'unknown'}.png`,
                            cols: o.cols ?? 4,
                            idleCount: o.idleCount ?? 4,
                            idleFrameRate: o.idleFrameRate ?? 6,
                        };
                    }),
                );
            })
            .catch(() => setTypes([]));
    }, []);

    useEffect(() => {
        const wrapper = wrapperRef.current;
        const container = document.getElementById('game-container');
        if (!wrapper || !container) return;

        const phaserCanvas = container.querySelector<HTMLCanvasElement>(':scope > canvas');
        if (!phaserCanvas) return;

        const update = () => {
            const cRect = phaserCanvas.getBoundingClientRect();
            const wRect = wrapper.getBoundingClientRect();
            setBox({
                x: cRect.left - wRect.left,
                y: cRect.top - wRect.top,
                width: cRect.width,
                height: cRect.height,
            });
        };
        const scheduleUpdate = () => {
            update();
            if (typeof window !== 'undefined') {
                requestAnimationFrame(update);
                setTimeout(update, 50);
                setTimeout(update, 150);
                setTimeout(update, 300);
            }
        };
        scheduleUpdate();
        const ro = new ResizeObserver(scheduleUpdate);
        ro.observe(container);
        ro.observe(phaserCanvas);
        EventBus.on('editor-open', scheduleUpdate);
        return () => {
            ro.disconnect();
            EventBus.removeListener('editor-open', scheduleUpdate);
        };
        // Re-run when image size changes (scene jump to a new level).
    }, [level.imageSize.width, level.imageSize.height]);

    const scale = useMemo(() => {
        if (box.width === 0 || box.height === 0) return 1;
        return Math.min(
            box.width / level.imageSize.width,
            box.height / level.imageSize.height,
        );
    }, [box, level.imageSize]);

    const typeById = useMemo(() => {
        const m = new Map<string, MonsterTypeInfo>();
        for (const t of types) m.set(t.id, t);
        return m;
    }, [types]);

    // Color waves by appearance order so wave-1..wave-N get distinct colors.
    const waveIndex = useMemo(() => {
        const order: string[] = [];
        const idx = new Map<string, number>();
        for (const m of level.monsters ?? []) {
            const w = m.waveId ?? '';
            if (w && !idx.has(w)) {
                idx.set(w, order.length);
                order.push(w);
            }
        }
        return idx;
    }, [level.monsters]);

    return (
        <div
            ref={wrapperRef}
            className={`absolute inset-0 ${active ? 'pointer-events-none' : 'hidden'}`}
        >
            {box.width > 0 && box.height > 0 && (
                <>
                    <style>
                        {(level.monsters ?? []).map((m, i) => {
                            const info = typeById.get(m.type);
                            if (!info) return null;
                            const cols = info.cols;
                            const idleCount = info.idleCount;
                            // Slide from frame 0 to the last idle frame.
                            // background-size is cols×100% so each frame
                            // is 100/cols % wide; idleCount frames fit in
                            // (idleCount-1)/cols of the sheet width.
                            const endPct = -(((idleCount - 1) / cols) * 100).toFixed(3);
                            return (
                                <span key={i}>{`@keyframes monster-idle-${i}{from{background-position:0% 50%}to{background-position:${endPct}% 50%}}`}</span>
                            );
                        })}
                    </style>
                    <div
                        className="absolute"
                        style={{
                            left: box.x,
                            top: box.y,
                            width: box.width,
                            height: box.height,
                        }}
                    >
                        {(level.monsters ?? []).map((m, i) => {
                            const info = typeById.get(m.type);
                            const waveI = waveIndex.get(m.waveId ?? '') ?? 0;
                            const palette = WAVE_PALETTE[waveI % WAVE_PALETTE.length];
                            const left = m.x * scale - MARKER_W / 2;
                            const top = m.y * scale - MARKER_W / 2;
                            return (
                                <DraggableMarker
                                    key={i}
                                    index={i}
                                    spawn={m}
                                    left={left}
                                    top={top}
                                    scale={scale}
                                    palette={palette}
                                    info={info}
                                    onMove={onSpawnMove}
                                />
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
}

// ─── DraggableMarker ─────────────────────────────────────────────────────

interface DraggableMarkerProps {
    index: number;
    spawn: MonsterSpawn;
    left: number;
    top: number;
    scale: number;
    palette: string;
    info: MonsterTypeInfo | undefined;
    onMove?: (index: number, x: number, y: number) => void;
}

/**
 * One monster marker. Click + drag the thumbnail to reposition the
 * spawn in image space; release commits via `onMove`. The pin dot
 * stays fixed at the original spawn point until release, then snaps
 * to the new (x, y) when the parent re-renders with updated level
 * data — keeps the editor list and overlay in sync without flicker.
 */
function DraggableMarker({
    index,
    spawn,
    left,
    top,
    scale,
    palette,
    info,
    onMove,
}: DraggableMarkerProps) {
    const [dragOffset, setDragOffset] = useState<{ dx: number; dy: number } | null>(null);

    function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
        if (!onMove) return;
        // Only the sprite thumbnail owns the drag handle — labels
        // stay non-interactive so they don't steal the cursor.
        e.stopPropagation();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        setDragOffset({ dx: 0, dy: 0 });
    }

    function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
        if (!dragOffset || !onMove) return;
        setDragOffset({ dx: dragOffset.dx + e.movementX, dy: dragOffset.dy + e.movementY });
    }

    function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
        if (!dragOffset || !onMove) {
            setDragOffset(null);
            return;
        }
        const totalDx = dragOffset.dx + e.movementX;
        const totalDy = dragOffset.dy + e.movementY;
        const newX = Math.round(spawn.x + totalDx / scale);
        const newY = Math.round(spawn.y + totalDy / scale);
        onMove(index, newX, newY);
        setDragOffset(null);
    }

    const displayLeft = dragOffset ? left + dragOffset.dx : left;
    const displayTop = dragOffset ? top + dragOffset.dy : top;

    // Idle anim: cycle background-position across the sprite-sheet's
    // first `idleCount` frames at `idleFrameRate` fps. `steps(idleCount)`
    // makes it jump frame-by-frame instead of sliding smoothly.
    const cols = info?.cols ?? 4;
    const idleCount = info?.idleCount ?? 4;
    const idleFps = info?.idleFrameRate ?? 6;
    const animStyle: React.CSSProperties | undefined = info
        ? {
              width: MARKER_W,
              height: MARKER_W,
              backgroundImage: `url(${info.texture})`,
              backgroundSize: `${cols * 100}% auto`,
              backgroundPosition: '0% 50%',
              backgroundRepeat: 'no-repeat',
              animation: `monster-idle-${index} ${idleCount / idleFps}s steps(${idleCount}) infinite`,
          }
        : {};

    return (
        <div
            className="absolute flex flex-col items-center"
            style={{
                left: displayLeft,
                top: displayTop,
                width: MARKER_W,
            }}
        >
            {/* Pin dot at exact spawn point */}
            <div
                className="absolute size-2 rounded-full bg-red-500 ring-2 ring-red-300/80 shadow-[0_0_6px_rgba(239,68,68,0.9)]"
                style={{
                    left: MARKER_W / 2 - 4,
                    top: MARKER_W / 2 - 4,
                }}
            />
            {/* Sprite thumbnail — drag handle.
                pointer-events-auto so it receives the drag even though
                the rest of the overlay is non-interactive. */}
            <div
                className={`relative flex items-center justify-center border-2 ${palette} rounded ${onMove ? 'cursor-grab active:cursor-grabbing' : ''} pointer-events-auto`}
                style={{
                    ...animStyle,
                    touchAction: 'none',
                }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                title={info?.name ?? spawn.type}
            >
                {!info && (
                    <span className="text-[9px] font-mono text-neutral-300 leading-none text-center px-1">
                        {spawn.type}
                    </span>
                )}
            </div>
            {/* Wave badge */}
            <div
                className={`mt-1 px-1.5 py-px border ${palette} rounded-sm font-mono text-[9px] leading-none uppercase tracking-wider`}
            >
                {spawn.waveId ?? 'no-wave'}
            </div>
            {/* Name */}
            <div
                className="mt-0.5 px-1 py-px bg-black/70 border border-neutral-700 rounded-sm font-mono text-[9px] leading-none text-neutral-100 whitespace-nowrap max-w-[140px] truncate"
                title={info?.name ?? spawn.type}
            >
                {info?.name ?? spawn.type}
            </div>
        </div>
    );
}