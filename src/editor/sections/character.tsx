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

import { useEffect, useState } from 'react';
import { Plus, Upload, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

interface CharacterRow {
    id: string;
    name: string;
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
    };
    sprite?: {
        texture: string;
        grid: { rows: number; cols: number };
        scale: number;
        offset?: { left?: number; bottom?: number; x?: number; y?: number };
        script?: { downsample?: number; colors?: number; pad?: number };
    };
    anims?: Record<
        string,
        { frames: [number, number]; frameRate: number; repeat: number }
    >;
}

export function CharacterSection() {
    const [chars, setChars] = useState<CharacterRow[]>([]);
    const [selected, setSelected] = useState<string | null>(null);
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
        if (!selected) {
            setSpec(null);
            return;
        }
        setSpec(null);
        setError(null);
        setDirty(false);
        fetch('/api/editor/get-character', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: selected }),
        })
            .then((r) => r.json())
            .then((body) => {
                if (body.error) throw new Error(body.error);
                setSpec(body.spec);
            })
            .catch((e) => setError(String(e?.message ?? e)));
    }, [selected]);

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
            setSelected(id);
        } catch (e) {
            setError(String((e as Error).message ?? e));
        } finally {
            setCreating(false);
        }
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

    async function handleSave() {
        if (!spec || !selected) return;
        setSaving(true);
        setError(null);
        try {
            const res = await fetch('/api/editor/save-character', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: selected, spec }),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error);
            setDirty(false);
        } catch (e) {
            setError(String((e as Error).message ?? e));
        } finally {
            setSaving(false);
        }
    }

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

            <div className="flex flex-col gap-1">
                {chars.map((c) => {
                    const isSel = c.id === selected;
                    return (
                        <button
                            key={c.id}
                            onClick={() => setSelected(c.id)}
                            className={`flex items-center gap-2 border rounded px-2 py-1.5 text-left transition ${
                                isSel
                                    ? 'bg-cyan-950/40 border-cyan-500/60 text-cyan-200'
                                    : 'bg-neutral-900 border-neutral-800 text-neutral-300 hover:border-neutral-700'
                            }`}
                        >
                            <div className="flex-1 min-w-0">
                                <div className="font-medium truncate text-[12px]">{c.name}</div>
                                <div className="text-[10px] font-mono text-neutral-500 truncate">
                                    {c.id}
                                </div>
                            </div>
                            <ChevronRight className="size-3 text-neutral-500" />
                        </button>
                    );
                })}
            </div>

            {spec && (
                <CharacterForm
                    spec={spec}
                    dirty={dirty}
                    saving={saving}
                    onPatch={patch}
                    onPatchDeep={patchDeep}
                    onSave={handleSave}
                />
            )}

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
                            <label className="text-[11px] text-neutral-400">ID (kebab-case)</label>
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
                            <label className="text-[11px] text-neutral-400">Name (shown in HUD)</label>
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
    dirty: boolean;
    saving: boolean;
    onPatch: (p: Partial<CharacterSpec>) => void;
    onPatchDeep: <K extends keyof CharacterSpec>(
        key: K,
        p: Partial<NonNullable<CharacterSpec[K]>>,
    ) => void;
    onSave: () => void;
}

function CharacterForm({ spec, dirty, saving, onPatch, onPatchDeep, onSave }: FormProps) {
    return (
        <div className="flex flex-col gap-2 border-t border-neutral-800 pt-3">
            <div className="font-semibold text-neutral-300 text-[12px]">Edit · {spec.id}</div>

            <Section title="Identity">
                <Field label="Name">
                    <Input
                        value={spec.name}
                        onChange={(e) => onPatch({ name: e.target.value })}
                        className="h-7 text-xs bg-neutral-950 border-neutral-700"
                    />
                </Field>
                <Field label="Gender">
                    <select
                        value={spec.gender ?? ''}
                        onChange={(e) =>
                            onPatch({
                                gender:
                                    e.target.value === ''
                                        ? undefined
                                        : (e.target.value as 'male' | 'female'),
                            })
                        }
                        className="h-7 text-xs bg-neutral-950 border border-neutral-700 rounded px-1.5 text-neutral-200 w-full"
                    >
                        <option value="">(none)</option>
                        <option value="male">male</option>
                        <option value="female">female</option>
                    </select>
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
                <HotbarEditor
                    hotbar={spec.hotbar}
                    onChange={(h) => onPatch({ hotbar: h })}
                />
            </Section>

            <Section title="Sprite">
                <SpriteEditor spec={spec} onPatch={onPatch} onPatchDeep={onPatchDeep} />
            </Section>

            <Section title="Anims">
                <AnimsEditor
                    anims={spec.anims ?? {}}
                    onChange={(a) => onPatch({ anims: a })}
                />
            </Section>

            <Section title="SFX">
                <SfxEditor
                    sfx={spec.sfx ?? {}}
                    onChange={(s) => onPatch({ sfx: s })}
                />
            </Section>

            <Button
                disabled={!dirty || saving}
                onClick={onSave}
                className="self-end bg-cyan-500 hover:bg-cyan-400 text-black font-semibold text-xs h-7 px-3 disabled:bg-neutral-700 disabled:text-neutral-500"
            >
                {saving ? 'Saving…' : 'Save'}
            </Button>
        </div>
    );
}

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
            <label className="text-[10px] text-neutral-400">{label}</label>
            {children}
        </div>
    );
}

function NumberField({
    label,
    value,
    onChange,
    step,
}: {
    label: string;
    value: number;
    onChange: (v: number) => void;
    step?: number;
}) {
    return (
        <Field label={label}>
            <Input
                type="number"
                value={value}
                step={step}
                onChange={(e) => onChange(Number(e.target.value))}
                className="h-7 text-xs bg-neutral-950 border-neutral-700"
            />
        </Field>
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

function SpriteEditor({
    spec,
    onPatch,
    onPatchDeep,
}: Pick<FormProps, 'onPatch' | 'onPatchDeep'> & { spec: CharacterSpec }) {
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleUpload(file: File) {
        setUploading(true);
        setError(null);
        try {
            const dataUrl: string = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = () => reject(new Error('FileReader failed'));
                reader.readAsDataURL(file);
            });
            const res = await fetch('/api/editor/upload-character-sprite', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: spec.id,
                    fileData: dataUrl,
                    options: spec.sprite?.script ?? {},
                }),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error);
            // Auto-fill sprite block from server response + spec defaults.
            onPatch({
                sprite: {
                    texture: body.path,
                    grid: spec.sprite?.grid ?? { rows: 4, cols: 4 },
                    scale: spec.sprite?.scale ?? 1.2,
                    offset: spec.sprite?.offset ?? { left: -6, bottom: -2 },
                    script: spec.sprite?.script ?? { downsample: 4, colors: 32, pad: 2 },
                },
            });
            // Update imageSize to match natural size of the processed sheet.
            onPatch({
                imageSize: `${body.naturalSize.width}x${body.naturalSize.height}`,
            });
        } catch (e) {
            setError(String((e as Error).message ?? e));
        } finally {
            setUploading(false);
        }
    }

    return (
        <div className="col-span-2 flex flex-col gap-2">
            {error && <div className="text-red-400 text-[11px]">{error}</div>}
            {spec.sprite ? (
                <div className="bg-neutral-950 border border-neutral-800 rounded p-2">
                    <img
                        src={`/${spec.sprite.texture}`}
                        alt="character sprite"
                        className="w-full max-h-48 object-contain bg-neutral-900"
                    />
                </div>
            ) : (
                <div className="text-neutral-500 italic text-center py-2 text-[11px]">
                    No sprite uploaded yet.
                </div>
            )}
            <label
                className={`flex items-center justify-center h-8 rounded px-3 font-medium transition cursor-pointer text-center ${
                    uploading
                        ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                        : 'bg-cyan-600 hover:bg-cyan-500 text-white'
                }`}
            >
                <Upload className="size-3 mr-1.5" />
                {uploading ? 'Processing…' : 'Upload & process sprite'}
                <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    disabled={uploading}
                    onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) {
                            handleUpload(f);
                            e.target.value = '';
                        }
                    }}
                    className="hidden"
                />
            </label>
            {spec.sprite && (
                <div className="grid grid-cols-4 gap-1.5">
                    <NumberField
                        label="rows"
                        value={spec.sprite.grid.rows}
                        onChange={(v) =>
                            onPatchDeep('sprite', { grid: { ...spec.sprite!.grid, rows: v } })
                        }
                    />
                    <NumberField
                        label="cols"
                        value={spec.sprite.grid.cols}
                        onChange={(v) =>
                            onPatchDeep('sprite', { grid: { ...spec.sprite!.grid, cols: v } })
                        }
                    />
                    <NumberField
                        label="scale"
                        value={spec.sprite.scale}
                        step={0.1}
                        onChange={(v) => onPatchDeep('sprite', { scale: v })}
                    />
                    <Field label="imageSize">
                        <Input
                            value={spec.imageSize ?? ''}
                            onChange={(e) => onPatch({ imageSize: e.target.value })}
                            placeholder="WxH"
                            className="h-7 text-xs bg-neutral-950 border-neutral-700"
                        />
                    </Field>
                </div>
            )}
        </div>
    );
}

function AnimsEditor({
    anims,
    onChange,
}: {
    anims: Record<string, { frames: [number, number]; frameRate: number; repeat: number }>;
    onChange: (next: typeof anims) => void;
}) {
    const [newName, setNewName] = useState('');
    const entries = Object.entries(anims);
    return (
        <div className="col-span-2 flex flex-col gap-1.5">
            {entries.map(([name, a]) => (
                <div key={name} className="border border-neutral-800 rounded bg-neutral-950 p-2">
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-neutral-300 font-medium text-[11px]">{name}</span>
                        <button
                            onClick={() => {
                                const { [name]: _omit, ...rest } = anims;
                                void _omit;
                                onChange(rest);
                            }}
                            className="text-red-400 text-[10px] hover:text-red-300"
                        >
                            ✕
                        </button>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                        <NumberField
                            label="frame start"
                            value={a.frames[0]}
                            onChange={(v) =>
                                onChange({
                                    ...anims,
                                    [name]: {
                                        ...a,
                                        frames: [v, Math.max(v, a.frames[1])],
                                    },
                                })
                            }
                        />
                        <NumberField
                            label="frame end"
                            value={a.frames[1]}
                            onChange={(v) =>
                                onChange({
                                    ...anims,
                                    [name]: {
                                        ...a,
                                        frames: [Math.min(a.frames[0], v), v],
                                    },
                                })
                            }
                        />
                        <NumberField
                            label="frameRate"
                            value={a.frameRate}
                            onChange={(v) => onChange({ ...anims, [name]: { ...a, frameRate: v } })}
                        />
                        <NumberField
                            label="repeat"
                            value={a.repeat}
                            onChange={(v) => onChange({ ...anims, [name]: { ...a, repeat: v } })}
                        />
                    </div>
                </div>
            ))}
            <div className="flex items-center gap-1.5">
                <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="anim-name (e.g. dodge)"
                    className="h-7 text-xs bg-neutral-950 border-neutral-700 flex-1"
                />
                <Button
                    size="sm"
                    onClick={() => {
                        const n = newName.trim();
                        if (!n || anims[n]) return;
                        onChange({ ...anims, [n]: { frames: [0, 0], frameRate: 8, repeat: 0 } });
                        setNewName('');
                    }}
                    className="h-7 px-2 text-[10px] bg-cyan-600 hover:bg-cyan-500 text-white"
                >
                    Add
                </Button>
            </div>
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
                    onChange={(e) =>
                        onChange({ ...sfx, hurtFemale: e.target.value || undefined })
                    }
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
        </div>
    );
}