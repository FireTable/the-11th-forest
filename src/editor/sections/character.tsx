/**
 * src/editor/sections/character.tsx
 * --------------------------------------------------------------------------
 * Characters top-tab — list every character in index.yaml + edit form.
 *
 * Persistence:
 *   - GET  /api/editor/list-characters     → ids + names
 *   - GET  /api/editor/get-character       → full spec for the selected id
 *   - POST /api/editor/save-character      → write spec yaml
 *   - POST /api/editor/create-character    → minimal template + index
 *   - POST /api/editor/upload-character-sprite → runs split-sheet.ts
 *
 * Sprite upload writes the processed PNG + reports natural size. The
 * editor auto-fills sprite.grid + anim frame indices based on a 4-row
 * / 4-col default that matches the AI-gen prompt.
 */

import { useCallback, useEffect, useState } from 'react';
import { Plus, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Field, NumberField, Section } from './fields';
import {
    AnimsEditor,
    SpriteUploader,
    type SpriteSpec,
    type AnimSpec,
} from './sprite-editor';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

interface CharacterRow {
    id: string;
    name: string;
}

/**
 * Save-state snapshot the panel consumes to drive its single outer Save
 * button. See `ModuleSaveState` for the equivalent on the module shell.
 */
export interface CharacterSaveState {
    dirty: boolean;
    saving: boolean;
    error: string | null;
    save: () => Promise<void>;
}

// Mirrors the Zod schema in src/lib/characters/schema.ts. We don't
// import the schema directly — the server validates on save and the
// editor is the only writer, so a duplicate TS shape is fine.
interface CharacterSpec {
    id: string;
    name: string;
    imageSize?: string;
    prompt?: string;
    hp: number;
    sp: number;
    moveSpeed: number;
    spRegenMs: number;
    gender?: 'male' | 'female';
    body: { halfW: number; halfH: number };
    dodge: { spCost: number; speed: number; durationMs: number; cooldownMs: number };
    hotbar: string[];
    sfx?: {
        dodge?: string;
        hurt?: string;
        hurtMale?: string;
        hurtFemale?: string;
        footstep?: string;
        footstepThrottleMs?: number;
        lowHpHeartbeat?: string;
        lowHpThreshold?: number;
        lowHpPulseMs?: number;
        throttleMs?: number;
    };
    sprite?: {
        texture: string;
        grid: { rows: number; cols: number };
        scale: number;
        offset?: { left?: number; bottom?: number; x?: number; y?: number };
        script?: { downsample?: number; colors?: number; pad?: number };
    };
    anims?: Record<string, { frames: [number, number]; frameRate: number; repeat: number }>;
}

export function CharacterSection({
    onSaveStateChange,
}: {
    onSaveStateChange?: (state: CharacterSaveState | null) => void;
}) {
    const [chars, setChars] = useState<CharacterRow[]>([]);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [spec, setSpec] = useState<CharacterSpec | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [newOpen, setNewOpen] = useState(false);
    const [newId, setNewId] = useState('');
    const [newName, setNewName] = useState('');
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        refreshList();
    }, []);

    useEffect(() => {
        if (!expandedId) {
            setSpec(null);
            return;
        }
        setSpec(null);
        setError(null);
        setDirty(false);
        fetch('/api/editor/get-character', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: expandedId }),
        })
            .then((r) => r.json())
            .then((body) => {
                if (body.error) throw new Error(body.error);
                setSpec(body.spec);
            })
            .catch((e) => setError(String(e?.message ?? e)));
    }, [expandedId]);

    async function refreshList() {
        try {
            const res = await fetch('/api/editor/list-characters');
            const body = await res.json();
            if (!res.ok) throw new Error(body.error);
            setChars(body.characters ?? []);
        } catch (e) {
            setError(String((e as Error).message ?? e));
        }
    }

    async function handleCreate() {
        const id = newId.trim();
        if (!id) return;
        setCreating(true);
        setError(null);
        try {
            const res = await fetch('/api/editor/create-character', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, name: newName.trim() || id }),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error);
            setNewOpen(false);
            setNewId('');
            setNewName('');
            await refreshList();
            setExpandedId(id);
        } catch (e) {
            setError(String((e as Error).message ?? e));
        } finally {
            setCreating(false);
        }
    }

    function toggleExpand(id: string) {
        setExpandedId((cur) => (cur === id ? null : id));
    }

    function patch(p: Partial<CharacterSpec>) {
        if (!spec) return;
        setSpec({ ...spec, ...p });
        setDirty(true);
    }

    function patchDeep<K extends keyof CharacterSpec>(
        key: K,
        p: Partial<NonNullable<CharacterSpec[K]>>,
    ) {
        if (!spec) return;
        const next = { ...(spec[key] as object), ...p } as CharacterSpec[K];
        setSpec({ ...spec, [key]: next });
        setDirty(true);
    }

    const handleSave = useCallback(async () => {
        if (!spec || !expandedId) return;
        setSaving(true);
        setError(null);
        try {
            const res = await fetch('/api/editor/save-character', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: expandedId, spec }),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error);
            setDirty(false);
        } catch (e) {
            setError(String((e as Error).message ?? e));
        } finally {
            setSaving(false);
        }
    }, [spec, expandedId]);

    // Lift dirty / saving / error / save up to the panel so the single
    // outer Save button can dispatch. Null when there's no pending edit.
    useEffect(() => {
        if (!onSaveStateChange) return;
        if (!dirty && !saving && !error) {
            onSaveStateChange(null);
            return;
        }
        onSaveStateChange({ dirty, saving, error, save: handleSave });
    }, [dirty, saving, error, handleSave, onSaveStateChange]);

    return (
        <div className="flex flex-col gap-3 text-xs">
            {error && <div className="text-red-400 text-[11px]">{error}</div>}

            <div className="flex items-center justify-between">
                <div className="font-semibold text-neutral-300">Characters</div>
                <Button
                    size="sm"
                    className="gap-1 bg-cyan-500 hover:bg-cyan-400 text-black font-semibold h-7 text-xs"
                    onClick={() => setNewOpen(true)}
                >
                    <Plus className="size-3" />
                    New
                </Button>
            </div>

            <div className="flex flex-col gap-1.5">
                {chars.map((c) => {
                    const isExpanded = c.id === expandedId;
                    const isLoadingThis = isExpanded && spec === null && !error;
                    return (
                        <div
                            key={c.id}
                            className={`border rounded transition ${
                                isExpanded
                                    ? 'bg-neutral-900 border-cyan-500/60'
                                    : 'bg-neutral-900 border-neutral-800'
                            }`}
                        >
                            <Button
                                variant="ghost"
                                onClick={() => toggleExpand(c.id)}
                                className={`w-full justify-between h-auto px-2 py-1.5 rounded-[inherit] ${
                                    isExpanded
                                        ? 'bg-cyan-950/40 text-cyan-200 hover:bg-cyan-950/50'
                                        : 'text-neutral-300 hover:bg-neutral-800'
                                }`}
                            >
                                <div className="flex flex-col items-start min-w-0 flex-1">
                                    <div className="font-medium truncate text-[12px]">{c.name}</div>
                                    <div className="text-[10px] font-mono text-neutral-500 truncate">
                                        {c.id}
                                    </div>
                                </div>
                                <ChevronRight
                                    className={`size-3 text-neutral-500 shrink-0 transition-transform ${
                                        isExpanded ? 'rotate-90' : ''
                                    }`}
                                />
                            </Button>
                            {isExpanded && (
                                <div className="border-t border-neutral-800">
                                    {isLoadingThis && (
                                        <div className="px-2.5 py-3 text-[11px] text-neutral-500 italic">
                                            Loading…
                                        </div>
                                    )}
                                    {spec && (
                                        <CharacterForm
                                            spec={spec}
                                            onPatch={patch}
                                            onPatchDeep={patchDeep}
                                        />
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            <Dialog open={newOpen} onOpenChange={setNewOpen}>
                <DialogContent className="bg-neutral-900 border-neutral-800 text-neutral-200">
                    <DialogHeader>
                        <DialogTitle className="text-base font-semibold">New Character</DialogTitle>
                        <DialogDescription className="text-xs text-neutral-400 pt-1">
                            Creates a minimal yaml + appends to characters/index.yaml. Hotbar starts
                            with just the assault rifle.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex flex-col gap-2">
                        <div>
                            <Label className="text-[11px] text-neutral-400 leading-none font-normal mb-0.5">
                                ID (kebab-case)
                            </Label>
                            <Input
                                autoFocus
                                value={newId}
                                onChange={(e) =>
                                    setNewId(
                                        e.target.value
                                            .toLowerCase()
                                            .replace(/[^a-z0-9-]/g, '')
                                            .replace(/^-+|-+$/g, ''),
                                    )
                                }
                                placeholder="hero"
                                className="h-8 text-xs bg-neutral-950 border-neutral-700 mt-0.5"
                            />
                        </div>
                        <div>
                            <Label className="text-[11px] text-neutral-400 leading-none font-normal mb-0.5">
                                Name (shown in HUD)
                            </Label>
                            <Input
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                placeholder="Hero"
                                className="h-8 text-xs bg-neutral-950 border-neutral-700 mt-0.5"
                            />
                        </div>
                    </div>
                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setNewOpen(false)}
                            className="bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700 text-xs"
                        >
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            disabled={!newId.trim() || creating}
                            onClick={handleCreate}
                            className="bg-cyan-500 hover:bg-cyan-400 text-black font-semibold text-xs"
                        >
                            {creating ? 'Creating…' : 'Create'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

interface FormProps {
    spec: CharacterSpec;
    onPatch: (p: Partial<CharacterSpec>) => void;
    onPatchDeep: <K extends keyof CharacterSpec>(
        key: K,
        p: Partial<NonNullable<CharacterSpec[K]>>,
    ) => void;
}

function CharacterForm({ spec, onPatch, onPatchDeep }: FormProps) {
    return (
        <div className="flex flex-col gap-2 px-2.5 py-2.5">
            <Section title="Identity">
                <Field label="Name">
                    <Input
                        value={spec.name}
                        onChange={(e) => onPatch({ name: e.target.value })}
                        className="h-7 text-xs bg-neutral-950 border-neutral-700"
                    />
                </Field>
                <Field label="Gender">
                    <Select
                        value={spec.gender ?? '_none'}
                        onValueChange={(v) =>
                            onPatch({
                                gender: v === '_none' ? undefined : (v as 'male' | 'female'),
                            })
                        }
                    >
                        <SelectTrigger
                            size="sm"
                            className="h-7 text-xs bg-neutral-950 border-neutral-700"
                        >
                            <SelectValue placeholder="(none)" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="_none">(none)</SelectItem>
                            <SelectItem value="male">male</SelectItem>
                            <SelectItem value="female">female</SelectItem>
                        </SelectContent>
                    </Select>
                </Field>
            </Section>

            <Section title="Stats">
                <NumberField label="HP" value={spec.hp} onChange={(v) => onPatch({ hp: v })} />
                <NumberField label="SP" value={spec.sp} onChange={(v) => onPatch({ sp: v })} />
                <NumberField
                    label="Move speed"
                    value={spec.moveSpeed}
                    onChange={(v) => onPatch({ moveSpeed: v })}
                />
                <NumberField
                    label="SP regen ms"
                    value={spec.spRegenMs}
                    onChange={(v) => onPatch({ spRegenMs: v })}
                />
            </Section>

            <Section title="Body (half-extents)">
                <NumberField
                    label="halfW"
                    value={spec.body.halfW}
                    onChange={(v) => onPatchDeep('body', { halfW: v })}
                />
                <NumberField
                    label="halfH"
                    value={spec.body.halfH}
                    onChange={(v) => onPatchDeep('body', { halfH: v })}
                />
            </Section>

            <Section title="Dodge">
                <NumberField
                    label="spCost"
                    value={spec.dodge.spCost}
                    onChange={(v) => onPatchDeep('dodge', { spCost: v })}
                />
                <NumberField
                    label="speed"
                    value={spec.dodge.speed}
                    onChange={(v) => onPatchDeep('dodge', { speed: v })}
                />
                <NumberField
                    label="durationMs"
                    value={spec.dodge.durationMs}
                    onChange={(v) => onPatchDeep('dodge', { durationMs: v })}
                />
                <NumberField
                    label="cooldownMs"
                    value={spec.dodge.cooldownMs}
                    onChange={(v) => onPatchDeep('dodge', { cooldownMs: v })}
                />
            </Section>

            <Section title="Hotbar">
                <HotbarEditor hotbar={spec.hotbar} onChange={(h) => onPatch({ hotbar: h })} />
            </Section>

            <Section title="Sprite">
                <SpriteUploader
                    id={spec.id}
                    sprite={spec.sprite as SpriteSpec | undefined}
                    imageSize={spec.imageSize ?? null}
                    onSpriteChange={(s) => onPatchDeep('sprite', s)}
                    onImageSizeChange={(s) => onPatch({ imageSize: s })}
                    uploadEndpoint="/api/editor/upload-character-sprite"
                    uploadOptions={spec.sprite?.script ?? {}}
                    defaults={{
                        grid: { rows: 4, cols: 4 },
                        scale: 1.2,
                        offset: { left: -6, bottom: -2 },
                    }}
                    spriteFolder="characters"
                    altLabel="character"
                />
            </Section>

            <Section title="Anims">
                <AnimsEditor
                    anims={(spec.anims ?? {}) as Record<string, AnimSpec>}
                    onChange={(a) => onPatch({ anims: a })}
                    sprite={spec.sprite as SpriteSpec | undefined}
                />
            </Section>

            <Section title="SFX">
                <SfxEditor sfx={spec.sfx ?? {}} onChange={(s) => onPatch({ sfx: s })} />
            </Section>

            <Section title="AI prompt (regen)">
                <Textarea
                    value={spec.prompt ?? ''}
                    onChange={(e) => onPatch({ prompt: e.target.value || undefined })}
                    rows={3}
                    placeholder="Optional — used by AI regen pipeline."
                    className="col-span-2 text-[11px] bg-neutral-950 border-neutral-700 min-h-20"
                />
            </Section>
        </div>
    );
}


function SfxEditor({
    sfx,
    onChange,
}: {
    sfx: NonNullable<CharacterSpec['sfx']>;
    onChange: (next: NonNullable<CharacterSpec['sfx']>) => void;
}) {
    return (
        <div className="col-span-2 grid grid-cols-2 gap-1.5">
            <Field label="dodge">
                <Input
                    value={sfx.dodge ?? ''}
                    onChange={(e) => onChange({ ...sfx, dodge: e.target.value || undefined })}
                    className="h-7 text-xs bg-neutral-950 border-neutral-700"
                />
            </Field>
            <Field label="hurt (gender-neutral)">
                <Input
                    value={sfx.hurt ?? ''}
                    onChange={(e) => onChange({ ...sfx, hurt: e.target.value || undefined })}
                    className="h-7 text-xs bg-neutral-950 border-neutral-700"
                />
            </Field>
            <Field label="hurtFemale">
                <Input
                    value={sfx.hurtFemale ?? ''}
                    onChange={(e) => onChange({ ...sfx, hurtFemale: e.target.value || undefined })}
                    className="h-7 text-xs bg-neutral-950 border-neutral-700"
                />
            </Field>
            <Field label="hurtMale">
                <Input
                    value={sfx.hurtMale ?? ''}
                    onChange={(e) => onChange({ ...sfx, hurtMale: e.target.value || undefined })}
                    className="h-7 text-xs bg-neutral-950 border-neutral-700"
                />
            </Field>
            <Field label="footstep">
                <Input
                    value={sfx.footstep ?? ''}
                    onChange={(e) => onChange({ ...sfx, footstep: e.target.value || undefined })}
                    className="h-7 text-xs bg-neutral-950 border-neutral-700"
                />
            </Field>
            <NumberField
                label="footstepThrottleMs"
                value={sfx.footstepThrottleMs ?? 200}
                onChange={(v) => onChange({ ...sfx, footstepThrottleMs: v })}
            />
            <Field label="lowHpHeartbeat">
                <Input
                    value={sfx.lowHpHeartbeat ?? ''}
                    onChange={(e) =>
                        onChange({ ...sfx, lowHpHeartbeat: e.target.value || undefined })
                    }
                    className="h-7 text-xs bg-neutral-950 border-neutral-700"
                />
            </Field>
            <NumberField
                label="lowHpThreshold"
                value={sfx.lowHpThreshold ?? 0.3}
                step={0.05}
                onChange={(v) => onChange({ ...sfx, lowHpThreshold: v })}
            />
            <NumberField
                label="lowHpPulseMs"
                value={sfx.lowHpPulseMs ?? 900}
                onChange={(v) => onChange({ ...sfx, lowHpPulseMs: v })}
            />
            <NumberField
                label="throttleMs (hurt variants)"
                value={sfx.throttleMs ?? 0}
                onChange={(v) =>
                    onChange({
                        ...sfx,
                        throttleMs: v > 0 ? v : undefined,
                    })
                }
            />
        </div>
    );
}

function HotbarEditor({
    hotbar,
    onChange,
}: {
    hotbar: string[];
    onChange: (next: string[]) => void;
}) {
    const [newId, setNewId] = useState('');
    return (
        <div className="col-span-2 flex flex-col gap-1.5">
            {hotbar.map((w, i) => (
                <div key={i} className="flex items-center gap-1.5">
                    <span className="text-neutral-500 font-mono text-[10px] w-4">{i + 1}</span>
                    <Input
                        value={w}
                        onChange={(e) => {
                            const next = [...hotbar];
                            next[i] = e.target.value;
                            onChange(next);
                        }}
                        className="h-7 text-xs bg-neutral-950 border-neutral-700 flex-1"
                    />
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onChange(hotbar.filter((_, j) => j !== i))}
                        className="h-7 px-2 text-[10px] text-red-400 hover:text-red-300"
                    >
                        ✕
                    </Button>
                </div>
            ))}
            <div className="flex items-center gap-1.5">
                <Input
                    value={newId}
                    onChange={(e) => setNewId(e.target.value)}
                    placeholder="weapon-id"
                    className="h-7 text-xs bg-neutral-950 border-neutral-700 flex-1"
                />
                <Button
                    size="sm"
                    onClick={() => {
                        if (!newId.trim()) return;
                        onChange([...hotbar, newId.trim()]);
                        setNewId('');
                    }}
                    className="h-7 px-2 text-[10px] bg-cyan-600 hover:bg-cyan-500 text-white"
                >
                    Add
                </Button>
            </div>
        </div>
    );
}
