/**
 * src/editor/sections/monsters.tsx
 * --------------------------------------------------------------------------
 * Scenes → Monsters sub-tab — sortable list of monster spawns with full
 * trigger + waveId editor. Persists via /api/editor/save-monsters (which
 * rewrites just the `monsters:` array in the level yaml).
 *
 * No external dnd library — native HTML5 drag-and-drop on the row's
 * handle. Trigger.kind defaults to "time" with delayMs 0 = fires
 * immediately at scene start (the original behavior).
 *
 * Wave-id auto-numbering: when the user adds a new spawn without a
 * waveId, it inherits the previous row's waveId (so a burst of spawns
 * become the same wave).
 */

import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';

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
import type { Level, MonsterSpawn, MonsterTrigger } from '@/lib/levels/types';

interface Props {
    sceneId: string;
    level: Level;
    setLevel: (next: Level) => void;
}

const TRIGGER_KINDS: MonsterTrigger['kind'][] = ['time', 'clear'];

export function MonstersSection({ sceneId, level, setLevel }: Props) {
    const [availableTypes, setAvailableTypes] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        // Read the monsters index so the type dropdown knows the universe.
        fetch('/api/editor/list-monster-types')
            .then((r) => r.json())
            .then((b) => setAvailableTypes(b.types ?? []))
            .catch(() => setAvailableTypes([]));
    }, []);

    const monsters = level.monsters ?? [];

    function update(next: MonsterSpawn[]) {
        setLevel({ ...level, monsters: next });
    }

    function addSpawn() {
        const last = monsters[monsters.length - 1];
        const nextWaveId = last?.waveId ?? 'wave-1';
        const fallbackType = availableTypes[0] ?? 'drone';
        const newSpawn: MonsterSpawn = {
            type: fallbackType,
            x: Math.round(level.imageSize.width / 2),
            y: Math.round(level.imageSize.height / 2),
            waveId: monsters.length === 0 ? 'wave-1' : nextWaveId,
        };
        update([...monsters, newSpawn]);
    }

    function move(idx: number, delta: number) {
        const next = [...monsters];
        const j = idx + delta;
        if (j < 0 || j >= next.length) return;
        [next[idx], next[j]] = [next[j], next[idx]];
        update(next);
    }

    function remove(idx: number) {
        update(monsters.filter((_, i) => i !== idx));
    }

    function patch(idx: number, p: Partial<MonsterSpawn>) {
        const next = monsters.map((m, i) => (i === idx ? { ...m, ...p } : m));
        update(next);
    }

    function patchTrigger(idx: number, p: Partial<MonsterTrigger>) {
        const m = monsters[idx];
        const current: MonsterTrigger = m.trigger ?? { kind: 'time', delayMs: 0 };
        patch(idx, { trigger: { ...current, ...p } });
    }

    function clearTrigger(idx: number) {
        const next = monsters.map((m, i) => {
            if (i !== idx) return m;
            const { trigger, ...rest } = m;
            return rest as MonsterSpawn;
        });
        update(next);
    }

    async function handleSave() {
        setSaving(true);
        setError(null);
        try {
            const res = await fetch('/api/editor/save-monsters', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: sceneId, monsters }),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        } catch (e) {
            setError(String((e as Error).message ?? e));
        } finally {
            setSaving(false);
        }
    }

    // Summary at the top: "3 spawns in 2 waves".
    const summary = useMemo(() => {
        const waves = new Set<string>();
        for (const m of monsters) if (m.waveId) waves.add(m.waveId);
        return `${monsters.length} spawn${monsters.length === 1 ? '' : 's'} in ${waves.size} wave${waves.size === 1 ? '' : 's'}`;
    }, [monsters]);

    return (
        <div className="flex flex-col gap-3 text-xs">
            {error && <div className="text-red-400 text-[11px]">{error}</div>}

            <div className="flex items-center justify-between">
                <div className="font-semibold text-neutral-300">{summary}</div>
                <Button
                    size="sm"
                    className="gap-1 bg-cyan-500 hover:bg-cyan-400 text-black font-semibold h-7 text-xs"
                    onClick={addSpawn}
                    title="Add a new spawn row"
                >
                    <Plus className="size-3" />
                    Add
                </Button>
            </div>

            {monsters.length === 0 && (
                <div className="text-neutral-500 italic text-center py-4">
                    No monsters in this level yet.
                </div>
            )}

            <div className="flex flex-col gap-2">
                {monsters.map((m, idx) => (
                    <MonsterRow
                        key={idx}
                        index={idx}
                        spawn={m}
                        availableTypes={availableTypes}
                        onMove={move}
                        onRemove={remove}
                        onPatch={patch}
                        onPatchTrigger={patchTrigger}
                        onClearTrigger={clearTrigger}
                    />
                ))}
            </div>

            <div className="border-t border-neutral-800 pt-2 flex justify-end">
                <Button
                    disabled={saving}
                    onClick={handleSave}
                    className="bg-cyan-500 hover:bg-cyan-400 text-black font-semibold text-xs h-7 px-3"
                >
                    {saving ? 'Saving…' : 'Save monsters'}
                </Button>
            </div>
        </div>
    );
}

interface RowProps {
    index: number;
    spawn: MonsterSpawn;
    availableTypes: string[];
    onMove: (idx: number, delta: number) => void;
    onRemove: (idx: number) => void;
    onPatch: (idx: number, p: Partial<MonsterSpawn>) => void;
    onPatchTrigger: (idx: number, p: Partial<MonsterTrigger>) => void;
    onClearTrigger: (idx: number) => void;
}

function MonsterRow({
    index,
    spawn,
    availableTypes,
    onMove,
    onRemove,
    onPatch,
    onPatchTrigger,
    onClearTrigger,
}: RowProps) {
    const trigger = spawn.trigger;
    return (
        <div className="flex flex-col gap-1.5 border border-neutral-800 bg-neutral-900 rounded p-2">
            <div className="flex items-center gap-1.5">
                <span className="text-neutral-500 font-mono text-[10px] w-5 text-center">
                    #{index + 1}
                </span>
                <Select value={spawn.type} onValueChange={(v) => onPatch(index, { type: v })}>
                    <SelectTrigger
                        size="sm"
                        className="h-7 text-xs bg-neutral-950 border-neutral-700 flex-1 min-w-0"
                    >
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {availableTypes.length === 0 && (
                            <SelectItem value={spawn.type}>{spawn.type}</SelectItem>
                        )}
                        {availableTypes.map((t) => (
                            <SelectItem key={t} value={t}>
                                {t}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Button
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => onMove(index, -1)}
                    className="text-neutral-500 hover:text-neutral-200 hover:bg-transparent"
                    title="Move up"
                >
                    <ArrowUp />
                </Button>
                <Button
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => onMove(index, +1)}
                    className="text-neutral-500 hover:text-neutral-200 hover:bg-transparent"
                    title="Move down"
                >
                    <ArrowDown />
                </Button>
                <Button
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => onRemove(index)}
                    className="text-red-400 hover:text-red-300 hover:bg-transparent"
                    title="Remove"
                >
                    <Trash2 />
                </Button>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
                <div>
                    <Label className="text-[10px] text-neutral-400 leading-none font-normal mb-0.5">
                        waveId
                    </Label>
                    <Input
                        value={spawn.waveId ?? ''}
                        onChange={(e) =>
                            onPatch(index, {
                                waveId: e.target.value || undefined,
                            })
                        }
                        placeholder="(any)"
                        className="h-6 text-[11px] bg-neutral-950 border-neutral-700 px-1.5"
                    />
                </div>
                <div>
                    <Label className="text-[10px] text-neutral-400 leading-none font-normal mb-0.5">
                        x
                    </Label>
                    <Input
                        type="number"
                        value={spawn.x}
                        onChange={(e) => onPatch(index, { x: Number(e.target.value) })}
                        className="h-6 text-[11px] bg-neutral-950 border-neutral-700 px-1.5"
                    />
                </div>
                <div>
                    <Label className="text-[10px] text-neutral-400 leading-none font-normal mb-0.5">
                        y
                    </Label>
                    <Input
                        type="number"
                        value={spawn.y}
                        onChange={(e) => onPatch(index, { y: Number(e.target.value) })}
                        className="h-6 text-[11px] bg-neutral-950 border-neutral-700 px-1.5"
                    />
                </div>
            </div>

            <div className="border-t border-neutral-800 pt-1.5">
                <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-neutral-400 font-semibold uppercase tracking-wider">
                        Trigger
                    </span>
                    {trigger && (
                        <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => onClearTrigger(index)}
                            className="h-6 px-2 text-[10px] text-neutral-500 hover:text-red-400 hover:bg-transparent"
                            title="Fire immediately at level start"
                        >
                            Clear
                        </Button>
                    )}
                </div>
                {!trigger && (
                    <div className="text-[10px] text-neutral-500 italic">
                        No trigger — fires immediately at scene start.
                    </div>
                )}
                {trigger && (
                    <div className="grid grid-cols-3 gap-1.5">
                        <Select
                            value={trigger.kind}
                            onValueChange={(v) =>
                                onPatchTrigger(index, { kind: v as MonsterTrigger['kind'] })
                            }
                        >
                            <SelectTrigger
                                size="sm"
                                className="h-6 text-[11px] bg-neutral-950 border-neutral-700"
                            >
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {TRIGGER_KINDS.map((k) => (
                                    <SelectItem key={k} value={k}>
                                        {k}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Input
                            type="number"
                            min={0}
                            step={500}
                            value={trigger.delayMs}
                            onChange={(e) =>
                                onPatchTrigger(index, { delayMs: Number(e.target.value) })
                            }
                            placeholder="delay ms"
                            className="h-6 text-[11px] bg-neutral-950 border-neutral-700 px-1.5"
                        />
                        <Input
                            value={trigger.waveId ?? ''}
                            onChange={(e) =>
                                onPatchTrigger(index, {
                                    waveId: e.target.value || undefined,
                                })
                            }
                            placeholder="waveId"
                            className="h-6 text-[11px] bg-neutral-950 border-neutral-700 px-1.5"
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
