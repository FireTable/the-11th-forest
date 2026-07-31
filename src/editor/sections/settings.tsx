/**
 * src/editor/sections/settings.tsx
 * --------------------------------------------------------------------------
 * Scenes → Settings sub-tab — edit the top-level level fields that the
 * other sub-tabs don't touch:
 *   - title
 *   - prompt (AI regen, for scenes without a final background)
 *   - music id
 *   - pixelLighting flag
 *   - character id + characterSpawn (facing + x + y)
 *   - dropSpawns (level-level drops, separate from monster drops)
 *
 * Persistence goes through the standard save-level path: the section
 * mutates the level via `setLevel`, the bottom Save button in the
 * editor panel persists it.
 */

import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

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
import { Textarea } from '@/components/ui/textarea';
import type { CharacterSpawn, DropSpawn, Level } from '@/lib/levels/types';

interface Props {
    level: Level;
    setLevel: (next: Level) => void;
}

const _UNSET = '_none';

export function SettingsSection({ level, setLevel }: Props) {
    const [characterIds, setCharacterIds] = useState<string[]>([]);
    const [musicIds, setMusicIds] = useState<string[]>([]);

    useEffect(() => {
        fetch('/api/editor/list-module', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ module: 'characters' }),
        })
            .then((r) => r.json())
            .then((b) => setCharacterIds(b.ids ?? []))
            .catch(() => setCharacterIds([]));
        fetch('/api/editor/list-module', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ module: 'audios-music' }),
        })
            .then((r) => r.json())
            .then((b) => setMusicIds(b.ids ?? []))
            .catch(() => setMusicIds([]));
    }, []);

    function setCharacter(value: string) {
        if (value === _UNSET) {
            setLevel({ ...level, character: undefined });
        } else {
            setLevel({ ...level, character: value });
        }
    }

    function setMusic(value: string) {
        if (value === _UNSET) {
            setLevel({ ...level, music: undefined });
        } else {
            setLevel({ ...level, music: value });
        }
    }

    function setSpawn(next: CharacterSpawn | undefined) {
        setLevel({ ...level, characterSpawn: next });
    }

    function setDropSpawns(next: DropSpawn[]) {
        setLevel({ ...level, dropSpawns: next });
    }

    return (
        <div className="flex flex-col gap-2 text-xs">
            <Section title="Identity">
                <Field label="Title (shown in HUD)">
                    <Input
                        value={level.title}
                        onChange={(e) => setLevel({ ...level, title: e.target.value })}
                        className="h-7 text-xs bg-neutral-950 border-neutral-700"
                    />
                </Field>
            </Section>

            <Section title="Audio">
                <Field label="Music">
                    <Select
                        value={level.music ?? _UNSET}
                        onValueChange={setMusic}
                    >
                        <SelectTrigger size="sm" className="h-7 text-xs bg-neutral-950 border-neutral-700">
                            <SelectValue placeholder="(default)" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={_UNSET}>(default)</SelectItem>
                            {musicIds.map((m) => (
                                <SelectItem key={m} value={m}>
                                    {m}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </Field>
            </Section>

            <Section title="Visuals">
                <Field label="Pixel lighting">
                    <Select
                        value={level.pixelLighting ? 'true' : 'false'}
                        onValueChange={(v) =>
                            setLevel({ ...level, pixelLighting: v === 'true' })
                        }
                    >
                        <SelectTrigger size="sm" className="h-7 text-xs bg-neutral-950 border-neutral-700">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="false">false</SelectItem>
                            <SelectItem value="true">true</SelectItem>
                        </SelectContent>
                    </Select>
                </Field>
            </Section>

            <Section title="Character">
                <Field label="character id">
                    <Select
                        value={level.character ?? _UNSET}
                        onValueChange={setCharacter}
                    >
                        <SelectTrigger size="sm" className="h-7 text-xs bg-neutral-950 border-neutral-700">
                            <SelectValue placeholder="(default)" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={_UNSET}>(default)</SelectItem>
                            {characterIds.map((c) => (
                                <SelectItem key={c} value={c}>
                                    {c}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </Field>
                <Field label="spawn facing">
                    <Select
                        value={level.characterSpawn?.facing ?? 'right'}
                        onValueChange={(v) =>
                            setSpawn({
                                facing: v as 'left' | 'right',
                                x: level.characterSpawn?.x ?? Math.round(level.imageSize.width / 2),
                                y:
                                    level.characterSpawn?.y ??
                                    Math.round(level.imageSize.height / 2),
                            })
                        }
                    >
                        <SelectTrigger size="sm" className="h-7 text-xs bg-neutral-950 border-neutral-700">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="right">right</SelectItem>
                            <SelectItem value="left">left</SelectItem>
                        </SelectContent>
                    </Select>
                </Field>
                <Field label="spawn x">
                    <Input
                        type="number"
                        value={level.characterSpawn?.x ?? Math.round(level.imageSize.width / 2)}
                        onChange={(e) =>
                            setSpawn({
                                facing: level.characterSpawn?.facing ?? 'right',
                                x: Number(e.target.value),
                                y:
                                    level.characterSpawn?.y ??
                                    Math.round(level.imageSize.height / 2),
                            })
                        }
                        className="h-7 text-xs bg-neutral-950 border-neutral-700"
                    />
                </Field>
                <Field label="spawn y">
                    <Input
                        type="number"
                        value={level.characterSpawn?.y ?? Math.round(level.imageSize.height / 2)}
                        onChange={(e) =>
                            setSpawn({
                                facing: level.characterSpawn?.facing ?? 'right',
                                x:
                                    level.characterSpawn?.x ??
                                    Math.round(level.imageSize.width / 2),
                                y: Number(e.target.value),
                            })
                        }
                        className="h-7 text-xs bg-neutral-950 border-neutral-700"
                    />
                </Field>
            </Section>

            <Section title="Drop spawns (level-level)">
                <DropSpawnEditor
                    spawns={level.dropSpawns ?? []}
                    onChange={setDropSpawns}
                />
            </Section>

            <Section title="AI prompt (scene regen)">
                <Textarea
                    value={level.prompt ?? ''}
                    onChange={(e) =>
                        setLevel({ ...level, prompt: e.target.value || undefined })
                    }
                    rows={4}
                    placeholder="Optional — used by AI scene/background regen pipeline."
                    className="col-span-2 text-[11px] bg-neutral-950 border-neutral-700 min-h-20"
                />
            </Section>
        </div>
    );
}

// ─── Drop spawns (level-level) ───────────────────────────────────────────

function DropSpawnEditor({
    spawns,
    onChange,
}: {
    spawns: DropSpawn[];
    onChange: (next: DropSpawn[]) => void;
}) {
    function add() {
        onChange([...spawns, { type: '', x: 0, y: 0 }]);
    }
    function patch(idx: number, p: Partial<DropSpawn>) {
        const next = spawns.map((s, i) => (i === idx ? { ...s, ...p } : s));
        onChange(next);
    }
    function remove(idx: number) {
        onChange(spawns.filter((_, i) => i !== idx));
    }

    return (
        <div className="col-span-2 flex flex-col gap-1.5">
            {spawns.length === 0 && (
                <div className="text-[11px] text-neutral-500 italic">
                    No level-level drops. (Monster drops are configured in the Monsters sub-tab.)
                </div>
            )}
            {spawns.map((s, i) => (
                <div key={i} className="grid grid-cols-[1fr_70px_70px_auto] gap-1.5 items-end">
                    <Field label="type">
                        <Input
                            value={s.type}
                            onChange={(e) => patch(i, { type: e.target.value })}
                            placeholder="drop-id"
                            className="h-7 text-xs bg-neutral-950 border-neutral-700"
                        />
                    </Field>
                    <Field label="x">
                        <Input
                            type="number"
                            value={s.x}
                            onChange={(e) => patch(i, { x: Number(e.target.value) })}
                            className="h-7 text-xs bg-neutral-950 border-neutral-700"
                        />
                    </Field>
                    <Field label="y">
                        <Input
                            type="number"
                            value={s.y}
                            onChange={(e) => patch(i, { y: Number(e.target.value) })}
                            className="h-7 text-xs bg-neutral-950 border-neutral-700"
                        />
                    </Field>
                    <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => remove(i)}
                        className="text-red-400 hover:text-red-300 hover:bg-transparent mb-0.5"
                        title="Remove drop spawn"
                    >
                        <Trash2 />
                    </Button>
                </div>
            ))}
            <Button
                size="sm"
                onClick={add}
                className="self-start h-7 text-[10px] gap-1 bg-cyan-600 hover:bg-cyan-500 text-white"
            >
                <Plus className="size-3" />
                Add drop spawn
            </Button>
        </div>
    );
}

// ─── Shared bits (mirror Field/Section shape used elsewhere) ─────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="bg-neutral-900 border border-neutral-800 rounded p-2.5 flex flex-col gap-2">
            <div className="font-semibold text-neutral-300 text-[11px] uppercase tracking-wider">
                {title}
            </div>
            <div className="grid grid-cols-2 gap-1.5">{children}</div>
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <Label className="text-[10px] text-neutral-400 leading-none font-normal mb-0.5">
                {label}
            </Label>
            {children}
        </div>
    );
}