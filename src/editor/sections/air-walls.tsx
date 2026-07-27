import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import type { AirWall, AirWallKind, Level } from '@/lib/levels/types';
import {
    addWall,
    moveWall,
    removeWall,
    resizeWall,
    setWallKind,
} from '@/lib/editor/air-walls';

interface Props {
    level: Level;
    setLevel: (level: Level) => void;
}

function num(v: string): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

export function AirWallsSection({ level, setLevel }: Props) {
    function handleAdd() {
        const w = Math.round(level.imageSize.width * 0.1);
        const h = Math.round(level.imageSize.height * 0.1);
        const x = Math.round((level.imageSize.width - w) / 2);
        const y = Math.round((level.imageSize.height - h) / 2);
        setLevel(addWall(level, 'tall', x, y, w, h));
    }

    return (
        <div>
            <Button variant="outline" className="w-full" onClick={handleAdd}>
                + Add wall
            </Button>
            {level.airWalls.length === 0 ? (
                <div className="text-neutral-500 italic text-center py-4 mt-3">
                    No walls yet.
                </div>
            ) : (
                <div className="mt-3">
                    {level.airWalls.map((w) => (
                        <WallRow key={w.id} wall={w} level={level} setLevel={setLevel} />
                    ))}
                </div>
            )}
        </div>
    );
}

interface RowProps {
    wall: AirWall;
    level: Level;
    setLevel: (level: Level) => void;
}

function WallRow({ wall, level, setLevel }: RowProps) {
    return (
        <div className="grid grid-cols-[56px_64px_1fr_1fr_1fr_1fr_24px] gap-1 items-center py-1.5 border-b border-neutral-800">
            <span className="text-neutral-500 font-mono text-[11px]">{wall.id}</span>
            <Select
                value={wall.kind}
                onValueChange={(v) => setLevel(setWallKind(level, wall.id, v as AirWallKind))}
            >
                <SelectTrigger size="sm" className="h-7 text-xs px-2">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="tall">tall</SelectItem>
                    <SelectItem value="short">short</SelectItem>
                </SelectContent>
            </Select>
            <Input
                type="number"
                value={wall.x}
                onChange={(e) =>
                    setLevel(moveWall(level, wall.id, num(e.target.value), wall.y))
                }
                className="h-7 text-xs px-1.5"
            />
            <Input
                type="number"
                value={wall.y}
                onChange={(e) =>
                    setLevel(moveWall(level, wall.id, wall.x, num(e.target.value)))
                }
                className="h-7 text-xs px-1.5"
            />
            <Input
                type="number"
                value={wall.width}
                onChange={(e) =>
                    setLevel(resizeWall(level, wall.id, num(e.target.value), wall.height))
                }
                className="h-7 text-xs px-1.5"
            />
            <Input
                type="number"
                value={wall.height}
                onChange={(e) =>
                    setLevel(resizeWall(level, wall.id, wall.width, num(e.target.value)))
                }
                className="h-7 text-xs px-1.5"
            />
            <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setLevel(removeWall(level, wall.id))}
                className="text-red-400 hover:text-red-300 hover:bg-transparent"
                title="Delete"
            >
                <X />
            </Button>
        </div>
    );
}