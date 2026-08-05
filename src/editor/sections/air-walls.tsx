import { useState, type Dispatch, type SetStateAction } from 'react';
import { Brush, Plus, Route, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { handleWallKindChange, handleWallRemove } from '@/editor/panel';
import { EventBus } from '@/lib/events/bus';
import type { AirWallKind, AirWallVertex, Level } from '@/lib/levels/types';

interface Props {
    level: Level;
    setLevel: (level: Level) => void;
    drawing: boolean;
    setDrawing: Dispatch<SetStateAction<boolean>>;
    onAddWall: () => void;
}

/**
 * Air-walls editor section.
 *
 * Drawing itself happens in <WallCanvas> (Konva overlay) — clicking
 * vertices there, dragging them, etc. This component owns only the
 * side panel UI: drawing-mode toggle, add placeholder wall, per-wall
 * kind dropdown + delete.
 */
export function AirWallsSection({ level, setLevel, drawing, setDrawing, onAddWall }: Props) {
    // Default off — the path-debug grid (per-cell red squares for
    // every A* walkable-cell vs wall-cell) is visually noisy enough
    // that the canvas stays cleaner without it. The toggle lets the
    // designer opt in when they actually want to see the grid.
    const [showPathDebug, setShowPathDebug] = useState(false);
    const togglePathDebug = (): void => {
        const next = !showPathDebug;
        setShowPathDebug(next);
        EventBus.emit('path-debug-visible', next);
    };

    return (
        <div>
            <div className="flex gap-2">
                <Button
                    variant={drawing ? 'default' : 'outline'}
                    className={`flex-1 gap-2 ${drawing ? 'bg-cyan-500 hover:bg-cyan-400 text-black' : 'bg-transparent'
                        }`}
                    onClick={() => setDrawing((d) => !d)}
                >
                    {drawing ? (
                        <>
                            <X className="size-4" />
                            Cancel drawing
                        </>
                    ) : (
                        <>
                            <Brush className="size-4" />
                            Draw on canvas
                        </>
                    )}
                </Button>
                <Button
                    variant="outline"
                    className="bg-transparent"
                    onClick={onAddWall}
                    title="Add a placeholder wall at center"
                >
                    <Plus className="size-4" />
                </Button>
            </div>

            <label
                className="mt-2 flex items-center justify-between gap-2 cursor-pointer select-none rounded border border-neutral-800 bg-neutral-900 px-2.5 py-2 hover:bg-neutral-800"
                title="Toggle pathfinding grid + per-monster path debug overlay"
            >
                <span className="flex items-center gap-2 text-xs">
                    <Route className="size-4" />
                    <span>Show path debug</span>
                </span>
                <span
                    role="switch"
                    aria-checked={showPathDebug}
                    tabIndex={0}
                    onKeyDown={(e) => {
                        if (e.key === ' ' || e.key === 'Enter') {
                            e.preventDefault();
                            togglePathDebug();
                        }
                    }}
                    onClick={(e) => {
                        // Prevent double-fire when the inner knob or
                        // label is clicked — <label> already toggles
                        // the inner checkbox on click.
                        e.stopPropagation();
                        togglePathDebug();
                    }}
                    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                        showPathDebug ? 'bg-amber-500' : 'bg-neutral-700'
                    }`}
                >
                    <span
                        className={`inline-block size-4 rounded-full bg-white shadow transition-transform ${
                            showPathDebug ? 'translate-x-4' : 'translate-x-0.5'
                        }`}
                    />
                </span>
                {/* Hidden checkbox so the <label> still drives a native
                     toggle (clicking the label fires change on this). */}
                <input
                    type="checkbox"
                    checked={showPathDebug}
                    onChange={togglePathDebug}
                    className="sr-only"
                />
            </label>

            {drawing && (
                <div className="text-cyan-400 text-[11px] text-center mt-2 italic">
                    Click on the canvas to add vertices. Click the first vertex to close.
                </div>
            )}

            {level.airWalls.length === 0 ? (
                <div className="text-neutral-500 italic text-center py-4 mt-3">No walls yet.</div>
            ) : (
                <div className="mt-3 space-y-2">
                    {level.airWalls.map((w) => (
                        <WallRow
                            key={w.id}
                            id={w.id}
                            kind={w.kind}
                            points={w.points}
                            setLevel={setLevel}
                            level={level}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

interface RowProps {
    id: string;
    kind: AirWallKind;
    points: AirWallVertex[];
    setLevel: (level: Level) => void;
    level: Level;
}

function WallPreview({ points, kind }: { points: AirWallVertex[]; kind: AirWallKind }) {
    if (points.length < 3) return null;

    let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;
    for (const [x, y] of points) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }

    const bw = Math.max(1, maxX - minX);
    const bh = Math.max(1, maxY - minY);

    // Fit into 24x18 inner box with 4px padding in 32x26 container
    const svgW = 32;
    const svgH = 26;
    const pad = 4;
    const drawW = svgW - pad * 2;
    const drawH = svgH - pad * 2;
    const scale = Math.min(drawW / bw, drawH / bh);

    const offsetX = pad + (drawW - bw * scale) / 2;
    const offsetY = pad + (drawH - bh * scale) / 2;

    const pathData =
        points
            .map(([x, y], i) => {
                const sx = ((x - minX) * scale + offsetX).toFixed(1);
                const sy = ((y - minY) * scale + offsetY).toFixed(1);
                return `${i === 0 ? 'M' : 'L'} ${sx} ${sy}`;
            })
            .join(' ') + ' Z';

    const stroke = kind === 'tall' ? '#ff3344' : '#3388ff';
    const fill = kind === 'tall' ? 'rgba(255, 51, 68, 0.3)' : 'rgba(51, 136, 255, 0.3)';

    return (
        <svg
            width={svgW}
            height={svgH}
            className="bg-neutral-950 rounded border border-neutral-800 shrink-0"
        >
            <path
                d={pathData}
                fill={fill}
                stroke={stroke}
                strokeWidth="1.5"
                strokeLinejoin="round"
            />
        </svg>
    );
}

function WallRow({ id, kind, points, setLevel, level }: RowProps) {
    return (
        <div className="flex items-center gap-2 border border-neutral-800 rounded p-2 bg-neutral-900/40">
            <span className="text-neutral-500 font-mono text-[11px] min-w-11">{id}</span>
            <span className="text-neutral-600 text-[10px] shrink-0">
                {points.length} {points.length === 1 ? 'pt' : 'pts'}
            </span>
            <Select
                value={kind}
                onValueChange={(v) => handleWallKindChange(setLevel, level, id, v as AirWallKind)}
            >
                <SelectTrigger size="sm" className="h-7 text-xs px-2 w-[72px] shrink-0">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="tall">tall</SelectItem>
                    <SelectItem value="short">short</SelectItem>
                </SelectContent>
            </Select>

            {/* Polygon Shape SVG Mini Preview */}
            <div className="flex items-center justify-center ml-auto mr-1">
                <WallPreview points={points} kind={kind} />
            </div>

            <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => handleWallRemove(setLevel, level, id)}
                className="text-red-400 hover:text-red-300 hover:bg-transparent"
                title="Delete wall"
            >
                <X />
            </Button>
        </div>
    );
}
