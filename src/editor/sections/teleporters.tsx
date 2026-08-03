/**
 * src/editor/sections/teleporters.tsx
 * --------------------------------------------------------------------------
 * Scenes → Teleporters sub-tab — manage teleporters / portals in the level:
 *   - list placed teleporters
 *   - add new teleporters
 *   - edit x, y, targetScene, radius
 *   - delete teleporters
 */

import { useEffect, useState } from 'react';
import { Compass, Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { EventBus } from '@/lib/events/bus';
import type { Level, Teleporter } from '@/lib/levels/types';

interface Props {
    level: Level;
    setLevel: (next: Level) => void;
}

interface SceneOption {
    id: string;
    title: string;
}

const AUTO_NEXT_SCENE = '_auto';

export function TeleportersSection({ level, setLevel }: Props) {
    const [sceneOptions, setSceneOptions] = useState<SceneOption[]>([]);
    const teleporters = level.teleporters ?? [];

    useEffect(() => {
        fetch('/api/editor/list-scenes')
            .then((r) => r.json())
            .then((data) => {
                if (data.scenes && Array.isArray(data.scenes)) {
                    setSceneOptions(data.scenes);
                }
            })
            .catch(() => setSceneOptions([]));
    }, []);

    useEffect(() => {
        const onTeleporterUpdated = (payload: unknown) => {
            if (!payload || typeof payload !== 'object') return;
            const p = payload as { spec?: Teleporter; x?: number; y?: number; radius?: number };
            if (!p.spec || p.x === undefined || p.y === undefined) return;
            const targetId = p.spec.id;
            const currentTeleporters = level.teleporters ?? [];
            const next = currentTeleporters.map((t) =>
                t.id === targetId ? { ...t, x: p.x!, y: p.y!, radius: p.radius ?? t.radius } : t,
            );
            setLevel({ ...level, teleporters: next });
        };
        EventBus.on('teleporter-updated', onTeleporterUpdated);
        return () => EventBus.removeListener('teleporter-updated', onTeleporterUpdated);
    }, [level, setLevel]);

    function updateTeleporters(next: Teleporter[]) {
        setLevel({
            ...level,
            teleporters: next.length > 0 ? next : undefined,
        });
        EventBus.emit('teleporter-changed', { teleporters: next });
    }

    function handleAdd() {
        const cx = Math.round(level.imageSize.width / 2);
        const cy = Math.round(level.imageSize.height / 2);
        const newTeleporter: Teleporter = {
            id: `teleporter-${Date.now().toString(36)}`,
            x: cx,
            y: cy,
            radius: 40,
        };
        updateTeleporters([...teleporters, newTeleporter]);
    }

    function handleUpdate(index: number, patch: Partial<Teleporter>) {
        const next = teleporters.map((t, i) => (i === index ? { ...t, ...patch } : t));
        updateTeleporters(next);
    }

    function handleDelete(index: number) {
        const next = teleporters.filter((_, i) => i !== index);
        updateTeleporters(next);
    }

    function handleCenter(index: number) {
        const cx = Math.round(level.imageSize.width / 2);
        const cy = Math.round(level.imageSize.height / 2);
        handleUpdate(index, { x: cx, y: cy });
    }

    return (
        <div className="flex flex-col gap-3 text-xs">
            <div className="flex items-center justify-between">
                <span className="text-neutral-400 font-semibold flex items-center gap-1">
                    <Compass className="size-3.5" />
                    Teleporters ({teleporters.length})
                </span>
                <Button
                    variant="outline"
                    size="xs"
                    onClick={handleAdd}
                    className="gap-1 border-neutral-700 bg-neutral-950 text-cyan-400 hover:bg-neutral-800"
                >
                    <Plus className="size-3" />
                    Add Teleporter
                </Button>
            </div>

            {teleporters.length === 0 ? (
                <div className="text-neutral-500 italic text-center py-6 border border-dashed border-neutral-800 rounded bg-neutral-950/50">
                    No teleporters placed. Click "Add Teleporter" to create one.
                </div>
            ) : (
                teleporters.map((t, idx) => (
                    <div
                        key={t.id ?? idx}
                        className="flex flex-col gap-2 p-2.5 rounded border border-neutral-800 bg-neutral-950/80"
                    >
                        <div className="flex items-center justify-between gap-1 border-b border-neutral-800 pb-1.5">
                            <Input
                                value={t.id ?? `teleporter-${idx + 1}`}
                                onKeyDown={(e) => e.stopPropagation()}
                                onChange={(e) => handleUpdate(idx, { id: e.target.value })}
                                className="h-6 text-xs bg-neutral-900 border-neutral-700 font-mono text-cyan-300 w-44"
                                placeholder="teleporter-id"
                            />
                            <div className="flex items-center gap-1">
                                <Button
                                    variant="ghost"
                                    size="xs"
                                    onClick={() => handleCenter(idx)}
                                    title="Move to image center"
                                    className="h-6 px-1.5 text-[10px] text-neutral-400 hover:text-neutral-200"
                                >
                                    Center
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="xs"
                                    onClick={() => handleDelete(idx)}
                                    className="h-6 w-6 p-0 text-red-400 hover:text-red-300 hover:bg-red-950/30"
                                >
                                    <Trash2 className="size-3.5" />
                                </Button>
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                            <div>
                                <Label className="text-[10px] text-neutral-400">X Position</Label>
                                <Input
                                    type="number"
                                    value={t.x}
                                    onKeyDown={(e) => e.stopPropagation()}
                                    onChange={(e) =>
                                        handleUpdate(idx, {
                                            x: e.target.value === '' ? 0 : Number(e.target.value),
                                        })
                                    }
                                    className="h-6 text-xs bg-neutral-900 border-neutral-700 font-mono text-neutral-200"
                                />
                            </div>
                            <div>
                                <Label className="text-[10px] text-neutral-400">Y Position</Label>
                                <Input
                                    type="number"
                                    value={t.y}
                                    onKeyDown={(e) => e.stopPropagation()}
                                    onChange={(e) =>
                                        handleUpdate(idx, {
                                            y: e.target.value === '' ? 0 : Number(e.target.value),
                                        })
                                    }
                                    className="h-6 text-xs bg-neutral-900 border-neutral-700 font-mono text-neutral-200"
                                />
                            </div>
                            <div>
                                <Label className="text-[10px] text-neutral-400">
                                    Scale / Radius (px)
                                </Label>
                                <Input
                                    type="number"
                                    value={t.radius ?? 40}
                                    onKeyDown={(e) => e.stopPropagation()}
                                    onChange={(e) =>
                                        handleUpdate(idx, {
                                            radius:
                                                e.target.value === '' ? 40 : Number(e.target.value),
                                        })
                                    }
                                    className="h-6 text-xs bg-neutral-900 border-neutral-700 font-mono text-cyan-300"
                                />
                            </div>
                        </div>

                        <div>
                            <Label className="text-[10px] text-neutral-400">Target Scene</Label>
                            <Select
                                value={t.targetScene ?? AUTO_NEXT_SCENE}
                                onValueChange={(val) =>
                                    handleUpdate(idx, {
                                        targetScene: val === AUTO_NEXT_SCENE ? undefined : val,
                                    })
                                }
                            >
                                <SelectTrigger className="h-6 text-xs bg-neutral-900 border-neutral-700">
                                    <SelectValue placeholder="Select target scene" />
                                </SelectTrigger>
                                <SelectContent className="bg-neutral-900 border-neutral-800 text-xs">
                                    <SelectItem value={AUTO_NEXT_SCENE}>
                                        <span className="text-cyan-400 italic">
                                            Auto (Next Scene in Index)
                                        </span>
                                    </SelectItem>
                                    {sceneOptions.map((s) => (
                                        <SelectItem key={s.id} value={s.id}>
                                            {s.title} ({s.id})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                ))
            )}

            <div className="text-[11px] text-neutral-400 bg-neutral-950 p-2 rounded border border-neutral-800/80 leading-relaxed">
                💡 <span className="text-neutral-300 font-medium">Canvas Controls:</span> You can
                drag teleporters on the canvas to move them, or scroll your mouse wheel over a
                teleporter to adjust its Scale / Radius in real time.
            </div>
        </div>
    );
}
