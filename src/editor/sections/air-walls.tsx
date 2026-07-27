import type { Dispatch, SetStateAction } from 'react';
import { Brush, Plus, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    handleWallKindChange,
    handleWallRemove,
} from '@/editor/panel';
import type { AirWallKind, Level } from '@/lib/levels/types';

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
export function AirWallsSection({
    level,
    setLevel,
    drawing,
    setDrawing,
    onAddWall,
}: Props) {
    return (
        <div>
            <div className="flex gap-2">
                <Button
                    variant={drawing ? 'default' : 'outline'}
                    className={`flex-1 gap-2 ${
                        drawing ? 'bg-cyan-500 hover:bg-cyan-400 text-black' : 'bg-transparent'
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
            {drawing && (
                <div className="text-cyan-400 text-[11px] text-center mt-2 italic">
                    Click on the canvas to add vertices. Click the first vertex to close.
                </div>
            )}

            {level.airWalls.length === 0 ? (
                <div className="text-neutral-500 italic text-center py-4 mt-3">
                    No walls yet.
                </div>
            ) : (
                <div className="mt-3 space-y-2">
                    {level.airWalls.map((w) => (
                        <WallRow
                            key={w.id}
                            id={w.id}
                            kind={w.kind}
                            points={w.points.length}
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
    points: number;
    setLevel: (level: Level) => void;
    level: Level;
}

function WallRow({ id, kind, points, setLevel, level }: RowProps) {
    return (
        <div className="flex items-center gap-2 border border-neutral-800 rounded p-2 bg-neutral-900/40">
            <span className="text-neutral-500 font-mono text-[11px]">{id}</span>
            <span className="text-neutral-600 text-[10px]">
                {points} {points === 1 ? 'vertex' : 'vertices'}
            </span>
            <Select
                value={kind}
                onValueChange={(v) =>
                    handleWallKindChange(setLevel, level, id, v as AirWallKind)
                }
            >
                <SelectTrigger size="sm" className="h-7 text-xs px-2 w-[80px]">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="tall">tall</SelectItem>
                    <SelectItem value="short">short</SelectItem>
                </SelectContent>
            </Select>
            <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => handleWallRemove(setLevel, level, id)}
                className="text-red-400 hover:text-red-300 hover:bg-transparent ml-auto"
                title="Delete wall"
            >
                <X />
            </Button>
        </div>
    );
}