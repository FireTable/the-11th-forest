/**
 * src/editor/sections/modules.tsx
 * --------------------------------------------------------------------------
 * Per-module editors for drops / monsters / weapons / audios. Each uses
 * the generic /api/editor/list-module / get-module-spec / save-module-spec
 * / create-module-spec endpoints. Spec shapes are mirrored locally; full
 * validation happens server-side on save.
 */

import { useEffect, useState } from 'react';
import { Plus, ChevronRight } from 'lucide-react';

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

type ModuleSlug = 'drops' | 'monsters' | 'weapons' | 'audios-sfx' | 'audios-music';

interface ModuleShellProps {
    slug: ModuleSlug;
    label: string;
    newTemplate: (id: string, name: string) => unknown;
    renderForm: (spec: any, onPatch: (p: any) => void) => React.ReactNode;
    /** Optional section headers shown above the form. */
    sectionHint?: string;
}

/**
 * Generic shell shared by every module editor. Loads list of ids, fetches
 * the selected id's spec, renders a per-module form, persists via the
 * generic save endpoint.
 */
export function ModuleShell({
    slug,
    label,
    newTemplate,
    renderForm,
    sectionHint,
}: ModuleShellProps) {
    const [ids, setIds] = useState<string[]>([]);
    const [selected, setSelected] = useState<string | null>(null);
    const [spec, setSpec] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [newOpen, setNewOpen] = useState(false);
    const [newId, setNewId] = useState('');
    const [newName, setNewName] = useState('');
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        refresh();
    }, []);

    useEffect(() => {
        if (!selected) {
            setSpec(null);
            return;
        }
        setSpec(null);
        setError(null);
        setDirty(false);
        fetch('/api/editor/get-module-spec', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ module: slug, id: selected }),
        })
            .then((r) => r.json())
            .then((b) => {
                if (b.error) throw new Error(b.error);
                setSpec(b.spec);
            })
            .catch((e) => setError(String((e as Error).message ?? e)));
    }, [selected]);

    async function refresh() {
        try {
            const r = await fetch('/api/editor/list-module', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ module: slug }),
            });
            const b = await r.json();
            if (!r.ok) throw new Error(b.error);
            setIds(b.ids ?? []);
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
            const specBody = newTemplate(id, newName.trim() || id);
            const r = await fetch('/api/editor/create-module-spec', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ module: slug, id, spec: specBody }),
            });
            const b = await r.json();
            if (!r.ok) throw new Error(b.error);
            setNewOpen(false);
            setNewId('');
            setNewName('');
            await refresh();
            setSelected(id);
        } catch (e) {
            setError(String((e as Error).message ?? e));
        } finally {
            setCreating(false);
        }
    }

    function patch(p: any) {
        if (!spec) return;
        setSpec({ ...spec, ...p });
        setDirty(true);
    }

    async function handleSave() {
        if (!spec || !selected) return;
        setSaving(true);
        setError(null);
        try {
            const r = await fetch('/api/editor/save-module-spec', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ module: slug, id: selected, spec }),
            });
            const b = await r.json();
            if (!r.ok) throw new Error(b.error);
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
                <div className="font-semibold text-neutral-300">{label}</div>
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
                {ids.map((id) => {
                    const isSel = id === selected;
                    return (
                        <button
                            key={id}
                            onClick={() => setSelected(id)}
                            className={`flex items-center gap-2 border rounded px-2 py-1.5 text-left transition ${
                                isSel
                                    ? 'bg-cyan-950/40 border-cyan-500/60 text-cyan-200'
                                    : 'bg-neutral-900 border-neutral-800 text-neutral-300 hover:border-neutral-700'
                            }`}
                        >
                            <div className="flex-1 min-w-0">
                                <div className="font-medium truncate text-[12px] font-mono">
                                    {id}
                                </div>
                            </div>
                            <ChevronRight className="size-3 text-neutral-500" />
                        </button>
                    );
                })}
            </div>

            {spec && (
                <div className="border-t border-neutral-800 pt-3 flex flex-col gap-2">
                    <div className="font-semibold text-neutral-300 text-[12px]">
                        Edit · {selected}
                    </div>
                    {sectionHint && (
                        <div className="text-[11px] text-neutral-500 italic">{sectionHint}</div>
                    )}
                    {renderForm(spec, patch)}
                    <Button
                        disabled={!dirty || saving}
                        onClick={handleSave}
                        className="self-end bg-cyan-500 hover:bg-cyan-400 text-black font-semibold text-xs h-7 px-3 disabled:bg-neutral-700 disabled:text-neutral-500"
                    >
                        {saving ? 'Saving…' : 'Save'}
                    </Button>
                </div>
            )}

            <Dialog open={newOpen} onOpenChange={setNewOpen}>
                <DialogContent className="bg-neutral-900 border-neutral-800 text-neutral-200">
                    <DialogHeader>
                        <DialogTitle className="text-base font-semibold">New {label}</DialogTitle>
                        <DialogDescription className="text-xs text-neutral-400 pt-1">
                            Creates a yaml from a sensible default + appends to {slug}/index.yaml.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex flex-col gap-2">
                        <div>
                            <label className="text-[11px] text-neutral-400">ID</label>
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
                                placeholder="my-id"
                                className="h-8 text-xs bg-neutral-950 border-neutral-700 mt-0.5"
                            />
                        </div>
                        <div>
                            <label className="text-[11px] text-neutral-400">Name</label>
                            <Input
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                placeholder="Display Name"
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

// ─── Drops ────────────────────────────────────────────────────────────────

export function DropsSection() {
    return (
        <ModuleShell
            slug="drops"
            label="Drops"
            newTemplate={(id, name) => ({
                id,
                name,
                kind: 'static',
                visual: { size: 16, tint: 0xffffff },
                effect: { type: 'instant', hp: 10, sp: 0 },
            })}
            renderForm={(spec, patch) => <DropsForm spec={spec} patch={patch} />}
        />
    );
}

function DropsForm({ spec, patch }: { spec: any; patch: (p: any) => void }) {
    function setEffect(effect: any) {
        patch({ effect });
    }
    return (
        <div className="flex flex-col gap-2">
            <Section title="Identity">
                <Field label="Name">
                    <Input
                        value={spec.name}
                        onChange={(e) => patch({ name: e.target.value })}
                        className="h-7 text-xs bg-neutral-950 border-neutral-700"
                    />
                </Field>
                <Field label="Kind">
                    <select
                        value={spec.kind}
                        onChange={(e) => patch({ kind: e.target.value })}
                        className="h-7 text-xs bg-neutral-950 border border-neutral-700 rounded px-1.5 text-neutral-200 w-full"
                    >
                        <option value="static">static</option>
                        <option value="monster">monster</option>
                    </select>
                </Field>
            </Section>
            <Section title="Effect">
                <Field label="Type">
                    <select
                        value={spec.effect.type}
                        onChange={(e) => {
                            const t = e.target.value;
                            if (t === 'instant') setEffect({ type: 'instant', hp: 10, sp: 0 });
                            else if (t === 'refill-ammo')
                                setEffect({ type: 'refill-ammo', ammoFraction: 0.5 });
                            else setEffect({ type: 'weapon', weaponId: 'assault-rifle' });
                        }}
                        className="h-7 text-xs bg-neutral-950 border border-neutral-700 rounded px-1.5 text-neutral-200 w-full"
                    >
                        <option value="instant">instant</option>
                        <option value="refill-ammo">refill-ammo</option>
                        <option value="weapon">weapon</option>
                    </select>
                </Field>
                {spec.effect.type === 'instant' && (
                    <>
                        <NumberField
                            label="hp"
                            value={spec.effect.hp ?? 0}
                            onChange={(v) => setEffect({ ...spec.effect, hp: v })}
                        />
                        <NumberField
                            label="sp"
                            value={spec.effect.sp ?? 0}
                            onChange={(v) => setEffect({ ...spec.effect, sp: v })}
                        />
                    </>
                )}
                {spec.effect.type === 'refill-ammo' && (
                    <NumberField
                        label="ammoFraction"
                        value={spec.effect.ammoFraction}
                        step={0.05}
                        onChange={(v) => setEffect({ ...spec.effect, ammoFraction: v })}
                    />
                )}
                {spec.effect.type === 'weapon' && (
                    <Field label="weaponId">
                        <Input
                            value={spec.effect.weaponId}
                            onChange={(e) =>
                                setEffect({ ...spec.effect, weaponId: e.target.value })
                            }
                            className="h-7 text-xs bg-neutral-950 border-neutral-700"
                        />
                    </Field>
                )}
            </Section>
            <Section title="Audio">
                <Field label="sfx">
                    <Input
                        value={spec.sfx ?? ''}
                        onChange={(e) => patch({ sfx: e.target.value || undefined })}
                        placeholder="(default pickup)"
                        className="h-7 text-xs bg-neutral-950 border-neutral-700"
                    />
                </Field>
            </Section>
            <Section title="Visual">
                <NumberField
                    label="size"
                    value={spec.visual.size}
                    onChange={(v) => patch({ visual: { ...spec.visual, size: v } })}
                />
                <NumberField
                    label="tint"
                    value={spec.visual.tint}
                    step={1}
                    onChange={(v) => patch({ visual: { ...spec.visual, tint: v } })}
                />
            </Section>
        </div>
    );
}

// ─── Monsters ─────────────────────────────────────────────────────────────

export function MonstersSectionEditor() {
    return (
        <ModuleShell
            slug="monsters"
            label="Monsters"
            newTemplate={(id, name) => ({
                id,
                name,
                hp: 50,
                moveSpeed: 80,
                body: { halfW: 14, halfH: 14 },
                weaponId: 'monster-default',
                drops: [],
            })}
            renderForm={(spec, patch) => <MonsterForm spec={spec} patch={patch} />}
        />
    );
}

function MonsterForm({ spec, patch }: { spec: any; patch: (p: any) => void }) {
    return (
        <div className="flex flex-col gap-2">
            <Section title="Identity">
                <Field label="Name">
                    <Input
                        value={spec.name}
                        onChange={(e) => patch({ name: e.target.value })}
                        className="h-7 text-xs bg-neutral-950 border-neutral-700"
                    />
                </Field>
                <Field label="weaponId">
                    <Input
                        value={spec.weaponId}
                        onChange={(e) => patch({ weaponId: e.target.value })}
                        className="h-7 text-xs bg-neutral-950 border-neutral-700"
                    />
                </Field>
            </Section>
            <Section title="Stats">
                <NumberField label="HP" value={spec.hp} onChange={(v) => patch({ hp: v })} />
                <NumberField
                    label="Move speed"
                    value={spec.moveSpeed}
                    onChange={(v) => patch({ moveSpeed: v })}
                />
                <NumberField
                    label="body.halfW"
                    value={spec.body.halfW}
                    onChange={(v) => patch({ body: { ...spec.body, halfW: v } })}
                />
                <NumberField
                    label="body.halfH"
                    value={spec.body.halfH}
                    onChange={(v) => patch({ body: { ...spec.body, halfH: v } })}
                />
            </Section>
            <Section title="SFX">
                <Field label="hit">
                    <Input
                        value={spec.sfx?.hit ?? ''}
                        onChange={(e) =>
                            patch({ sfx: { ...spec.sfx, hit: e.target.value || undefined } })
                        }
                        className="h-7 text-xs bg-neutral-950 border-neutral-700"
                    />
                </Field>
                <Field label="death">
                    <Input
                        value={spec.sfx?.death ?? ''}
                        onChange={(e) =>
                            patch({ sfx: { ...spec.sfx, death: e.target.value || undefined } })
                        }
                        className="h-7 text-xs bg-neutral-950 border-neutral-700"
                    />
                </Field>
                <Field label="aggro">
                    <Input
                        value={spec.sfx?.aggro ?? ''}
                        onChange={(e) =>
                            patch({ sfx: { ...spec.sfx, aggro: e.target.value || undefined } })
                        }
                        className="h-7 text-xs bg-neutral-950 border-neutral-700"
                    />
                </Field>
            </Section>
            <Section title="Drops">
                <DropsEditor
                    drops={spec.drops ?? []}
                    onChange={(d) => patch({ drops: d })}
                />
            </Section>
        </div>
    );
}

function DropsEditor({
    drops,
    onChange,
}: {
    drops: { dropId: string; chance: number }[];
    onChange: (next: typeof drops) => void;
}) {
    return (
        <div className="col-span-2 flex flex-col gap-1.5">
            {drops.map((d, i) => (
                <div key={i} className="grid grid-cols-[1fr_80px_auto] gap-1.5">
                    <Input
                        value={d.dropId}
                        onChange={(e) => {
                            const next = [...drops];
                            next[i] = { ...d, dropId: e.target.value };
                            onChange(next);
                        }}
                        placeholder="drop-id"
                        className="h-7 text-xs bg-neutral-950 border-neutral-700"
                    />
                    <Input
                        type="number"
                        step={0.05}
                        min={0}
                        max={1}
                        value={d.chance}
                        onChange={(e) => {
                            const next = [...drops];
                            next[i] = { ...d, chance: Number(e.target.value) };
                            onChange(next);
                        }}
                        className="h-7 text-xs bg-neutral-950 border-neutral-700"
                    />
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onChange(drops.filter((_, j) => j !== i))}
                        className="h-7 px-2 text-[10px] text-red-400 hover:text-red-300"
                    >
                        ✕
                    </Button>
                </div>
            ))}
            <Button
                size="sm"
                onClick={() => onChange([...drops, { dropId: '', chance: 1 }])}
                className="h-7 text-[10px] bg-cyan-600 hover:bg-cyan-500 text-white"
            >
                + Add drop
            </Button>
        </div>
    );
}

// ─── Weapons ──────────────────────────────────────────────────────────────

export function WeaponsSectionEditor() {
    return (
        <ModuleShell
            slug="weapons"
            label="Weapons"
            newTemplate={(id, name) => ({
                id,
                name,
                damage: 10,
                cooldownMs: 200,
                range: 600,
                bullet: { type: 'projectile', scale: 1 },
                projectile: { speed: 600, visual: { radius: 4, width: 8, height: 8, color: 0xffff66 } },
                clipSize: 30,
                reloadTimeMs: 1500,
                sfx: {},
            })}
            renderForm={(spec, patch) => <WeaponForm spec={spec} patch={patch} />}
        />
    );
}

function WeaponForm({ spec, patch }: { spec: any; patch: (p: any) => void }) {
    const isMelee = spec.hitWidth !== undefined || spec.hitHeight !== undefined;
    function setKind(kind: 'ranged' | 'melee') {
        if (kind === 'melee') {
            const { projectile, ...rest } = spec;
            void projectile;
            patch({ ...rest, hitWidth: 60, hitHeight: 60 });
        } else {
            const { hitWidth, hitHeight, ...rest } = spec;
            void hitWidth;
            void hitHeight;
            patch({
                ...rest,
                projectile: {
                    speed: 600,
                    visual: { radius: 4, width: 8, height: 8, color: 0xffff66 },
                },
            });
        }
    }
    return (
        <div className="flex flex-col gap-2">
            <Section title="Identity">
                <Field label="Name">
                    <Input
                        value={spec.name}
                        onChange={(e) => patch({ name: e.target.value })}
                        className="h-7 text-xs bg-neutral-950 border-neutral-700"
                    />
                </Field>
                <Field label="Kind">
                    <select
                        value={isMelee ? 'melee' : 'ranged'}
                        onChange={(e) => setKind(e.target.value as 'ranged' | 'melee')}
                        className="h-7 text-xs bg-neutral-950 border border-neutral-700 rounded px-1.5 text-neutral-200 w-full"
                    >
                        <option value="ranged">ranged</option>
                        <option value="melee">melee</option>
                    </select>
                </Field>
            </Section>
            <Section title="Combat">
                <NumberField
                    label="damage"
                    value={spec.damage}
                    onChange={(v) => patch({ damage: v })}
                />
                <NumberField
                    label="cooldownMs"
                    value={spec.cooldownMs}
                    onChange={(v) => patch({ cooldownMs: v })}
                />
                <NumberField
                    label="range"
                    value={spec.range}
                    onChange={(v) => patch({ range: v })}
                />
                {isMelee ? (
                    <>
                        <NumberField
                            label="hitWidth"
                            value={spec.hitWidth ?? 0}
                            onChange={(v) => patch({ hitWidth: v })}
                        />
                        <NumberField
                            label="hitHeight"
                            value={spec.hitHeight ?? 0}
                            onChange={(v) => patch({ hitHeight: v })}
                        />
                    </>
                ) : (
                    <Field label="projectile.speed">
                        <Input
                            type="number"
                            value={spec.projectile?.speed ?? 600}
                            onChange={(e) =>
                                patch({
                                    projectile: {
                                        ...spec.projectile,
                                        speed: Number(e.target.value),
                                    },
                                })
                            }
                            className="h-7 text-xs bg-neutral-950 border-neutral-700"
                        />
                    </Field>
                )}
                <NumberField
                    label="clipSize"
                    value={spec.clipSize ?? 0}
                    onChange={(v) => patch({ clipSize: v })}
                />
                <NumberField
                    label="reloadTimeMs"
                    value={spec.reloadTimeMs ?? 0}
                    onChange={(v) => patch({ reloadTimeMs: v })}
                />
            </Section>
            <Section title="SFX">
                <Field label="shoot">
                    <Input
                        value={spec.sfx?.shoot ?? ''}
                        onChange={(e) =>
                            patch({ sfx: { ...spec.sfx, shoot: e.target.value || undefined } })
                        }
                        className="h-7 text-xs bg-neutral-950 border-neutral-700"
                    />
                </Field>
                <Field label="reloadStart">
                    <Input
                        value={spec.sfx?.reloadStart ?? ''}
                        onChange={(e) =>
                            patch({
                                sfx: { ...spec.sfx, reloadStart: e.target.value || undefined },
                            })
                        }
                        className="h-7 text-xs bg-neutral-950 border-neutral-700"
                    />
                </Field>
                <Field label="reloadFinish">
                    <Input
                        value={spec.sfx?.reloadFinish ?? ''}
                        onChange={(e) =>
                            patch({
                                sfx: { ...spec.sfx, reloadFinish: e.target.value || undefined },
                            })
                        }
                        className="h-7 text-xs bg-neutral-950 border-neutral-700"
                    />
                </Field>
            </Section>
        </div>
    );
}

// ─── Audios (sfx + music) ─────────────────────────────────────────────────

export function AudiosSection() {
    const [tab, setTab] = useState<'sfx' | 'music'>('sfx');
    return (
        <div className="flex flex-col gap-2">
            <nav className="flex border-b border-neutral-800">
                <Button
                    variant="ghost"
                    onClick={() => setTab('sfx')}
                    className={`flex-1 rounded-none border-b-2 ${
                        tab === 'sfx'
                            ? 'border-cyan-400 text-cyan-400'
                            : 'border-transparent text-neutral-500'
                    }`}
                >
                    SFX
                </Button>
                <Button
                    variant="ghost"
                    onClick={() => setTab('music')}
                    className={`flex-1 rounded-none border-b-2 ${
                        tab === 'music'
                            ? 'border-cyan-400 text-cyan-400'
                            : 'border-transparent text-neutral-500'
                    }`}
                >
                    Music
                </Button>
            </nav>
            {tab === 'sfx' && <AudioEditor slug="audios-sfx" label="SFX" />}
            {tab === 'music' && <AudioEditor slug="audios-music" label="Music" />}
        </div>
    );
}

function AudioEditor({ slug, label }: { slug: ModuleSlug; label: string }) {
    return (
        <ModuleShell
            slug={slug}
            label={label}
            newTemplate={(id, name) =>
                slug === 'audios-sfx'
                    ? {
                          kind: 'sfx',
                          id,
                          name,
                          source: `assets/audio/sfx/${id}.wav`,
                          volume: 1,
                          rate: 1,
                          loop: false,
                      }
                    : {
                          kind: 'music',
                          id,
                          name,
                          source: `assets/audio/music/${id}.mp3`,
                          volume: 0.5,
                          fadeIn: 1000,
                          fadeOut: 1000,
                      }
            }
            renderForm={(spec, patch) => <AudioForm spec={spec} patch={patch} />}
        />
    );
}

function AudioForm({ spec, patch }: { spec: any; patch: (p: any) => void }) {
    const isMusic = spec.kind === 'music';
    return (
        <div className="flex flex-col gap-2">
            <Section title="Identity">
                <Field label="Name">
                    <Input
                        value={spec.name}
                        onChange={(e) => patch({ name: e.target.value })}
                        className="h-7 text-xs bg-neutral-950 border-neutral-700"
                    />
                </Field>
                <Field label="Source">
                    <Input
                        value={spec.source}
                        onChange={(e) => patch({ source: e.target.value })}
                        className="h-7 text-xs bg-neutral-950 border-neutral-700 font-mono"
                    />
                </Field>
            </Section>
            <Section title="Playback">
                <NumberField
                    label="volume"
                    value={spec.volume}
                    step={0.05}
                    min={0}
                    max={1}
                    onChange={(v) => patch({ volume: v })}
                />
                {isMusic ? (
                    <>
                        <NumberField
                            label="fadeIn"
                            value={spec.fadeIn ?? 0}
                            onChange={(v) => patch({ fadeIn: v })}
                        />
                        <NumberField
                            label="fadeOut"
                            value={spec.fadeOut ?? 0}
                            onChange={(v) => patch({ fadeOut: v })}
                        />
                    </>
                ) : (
                    <>
                        <NumberField
                            label="rate"
                            value={spec.rate ?? 1}
                            step={0.05}
                            onChange={(v) => patch({ rate: v })}
                        />
                        <Field label="loop">
                            <select
                                value={spec.loop ? 'true' : 'false'}
                                onChange={(e) => patch({ loop: e.target.value === 'true' })}
                                className="h-7 text-xs bg-neutral-950 border border-neutral-700 rounded px-1.5 text-neutral-200 w-full"
                            >
                                <option value="false">false</option>
                                <option value="true">true</option>
                            </select>
                        </Field>
                    </>
                )}
            </Section>
            <Section title="AI prompt (ElevenLabs / MiniMax regen)">
                <textarea
                    value={spec.prompt ?? ''}
                    onChange={(e) => patch({ prompt: e.target.value || undefined })}
                    rows={3}
                    className="col-span-2 w-full text-[11px] bg-neutral-950 border border-neutral-700 rounded p-1.5 text-neutral-200 resize-y"
                />
            </Section>
        </div>
    );
}

// ─── Shared bits (duplicated from character.tsx for module-level reuse) ──

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
    min,
    max,
}: {
    label: string;
    value: number;
    onChange: (v: number) => void;
    step?: number;
    min?: number;
    max?: number;
}) {
    return (
        <Field label={label}>
            <Input
                type="number"
                value={value}
                step={step}
                min={min}
                max={max}
                onChange={(e) => onChange(Number(e.target.value))}
                className="h-7 text-xs bg-neutral-950 border-neutral-700"
            />
        </Field>
    );
}