/**
 * src/editor/asset-picker.tsx
 * --------------------------------------------------------------------------
 * Asset picker — replaces free-text <Input> for fields whose value is a
 * reference to a known asset (sprite texture path, SFX / music id, or
 * another entity id). Two flavors:
 *
 *   <SpritePicker folder="weapons" value onChange />
 *     Grid of PNG thumbnails; click to select. Used for `sprite.texture`,
 *     `visual.texture`, `bullet.texture` etc.
 *
 *   <IdPicker kind="sfx" value onChange />
 *     Compact scrollable list of ids; click to select. Used for
 *     `sfx.hit` / `weaponId` / `drops[].dropId` etc.
 *
 * Both fetch from the dev server on mount. If `value` doesn't match a
 * known option (e.g. a path the user typed by hand), the picker still
 * displays the raw value so the user can see what's saved.
 *
 * Network endpoints:
 *   /api/editor/list-sprites    POST { folder } → { sprites: [{id, path, url}] }
 *   /api/editor/list-module     POST { module }  → { ids: string[] }
 *     where `module` is one of `audios-sfx`, `audios-music`, `drops`,
 *     `monsters`, `weapons`, `characters`.
 */

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';

interface SpriteEntry {
    id: string;
    path: string;
    url: string;
}

// ─── Sprite picker ───────────────────────────────────────────────────────

export type SpriteFolder = 'characters' | 'monsters' | 'drops' | 'weapons';

export function SpritePicker({
    folder,
    value,
    onChange,
    /** Allow clearing the selection (renders a small ✕ button). */
    clearable = true,
}: {
    folder: SpriteFolder;
    value: string;
    onChange: (next: string) => void;
    clearable?: boolean;
}) {
    const [sprites, setSprites] = useState<SpriteEntry[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        fetch('/api/editor/list-sprites', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folder }),
        })
            .then((r) => r.json())
            .then((b) => {
                if (cancelled) return;
                if (b.error) throw new Error(b.error);
                setSprites(b.sprites ?? []);
            })
            .catch((e) => !cancelled && setError(String(e?.message ?? e)));
        return () => {
            cancelled = true;
        };
    }, [folder]);

    // A value can be either the bare id ("wanderer") or the full path
    // ("assets/image/characters/wanderer.png") — match either.
    const matched = sprites.find((s) => s.path === value || s.id === value || s.url === value);
    const preview = matched?.url ?? (value.startsWith('/') ? value : null);

    return (
        <div className="col-span-2 flex flex-col gap-1.5">
            {error && <div className="text-[11px] text-red-400">{error}</div>}

            {preview && (
                <div className="flex items-center gap-2 rounded border border-neutral-800 bg-neutral-950 p-1.5">
                    <img
                        src={preview}
                        alt={value}
                        className="h-12 w-12 rounded border border-neutral-700 bg-[length:8px_8px] bg-[linear-gradient(45deg,#1a1a1a_25%,transparent_25%,transparent_75%,#1a1a1a_75%,#1a1a1a),linear-gradient(45deg,#1a1a1a_25%,transparent_25%,transparent_75%,#1a1a1a_75%,#1a1a1a)] bg-[position:0_0,4px_4px] object-contain"
                    />
                    <div className="min-w-0 flex-1">
                        <div className="truncate text-[11px] font-mono text-neutral-300">
                            {value || '(none)'}
                        </div>
                        {matched && (
                            <div className="text-[10px] text-neutral-500">
                                {folder}/{matched.id}.png
                            </div>
                        )}
                    </div>
                    {clearable && value && (
                        <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => onChange('')}
                            className="text-neutral-500 hover:text-red-400"
                            title="Clear"
                        >
                            <X />
                        </Button>
                    )}
                </div>
            )}

            {!preview && !value && (
                <div className="text-[11px] italic text-neutral-500">No sprite selected.</div>
            )}

            {sprites.length === 0 && !error && (
                <div className="text-[11px] italic text-neutral-500">(no PNGs in {folder}/)</div>
            )}

            <div className="grid grid-cols-4 gap-1">
                {sprites.map((s) => {
                    const isSelected = matched?.id === s.id;
                    return (
                        <button
                            key={s.id}
                            type="button"
                            onClick={() => onChange(s.path)}
                            title={s.path}
                            className={
                                'group flex flex-col gap-0.5 rounded border p-1 transition ' +
                                (isSelected
                                    ? 'border-cyan-400 bg-cyan-950/40'
                                    : 'border-neutral-800 bg-neutral-950 hover:border-neutral-600 hover:bg-neutral-900')
                            }
                        >
                            <img
                                src={s.url}
                                alt={s.id}
                                className="h-12 w-full rounded object-contain"
                            />
                            <div
                                className={
                                    'truncate text-[9px] font-mono ' +
                                    (isSelected ? 'text-cyan-300' : 'text-neutral-400')
                                }
                            >
                                {s.id}
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

// ─── Id picker (SFX / music / drops / monsters / weapons / characters) ─

export type IdKind =
    'audios-sfx' | 'audios-music' | 'drops' | 'monsters' | 'weapons' | 'characters';

const KIND_LABEL: Record<IdKind, string> = {
    'audios-sfx': 'SFX',
    'audios-music': 'Music',
    drops: 'drops',
    monsters: 'monsters',
    weapons: 'weapons',
    characters: 'characters',
};

export function IdPicker({
    kind,
    value,
    onChange,
    clearable = true,
    placeholder,
}: {
    kind: IdKind;
    value: string;
    onChange: (next: string) => void;
    clearable?: boolean;
    placeholder?: string;
}) {
    const [ids, setIds] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        fetch('/api/editor/list-module', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ module: kind }),
        })
            .then((r) => r.json())
            .then((b) => {
                if (cancelled) return;
                if (b.error) throw new Error(b.error);
                setIds(b.ids ?? []);
            })
            .catch((e) => !cancelled && setError(String(e?.message ?? e)));
        return () => {
            cancelled = true;
        };
    }, [kind]);

    const matched = ids.includes(value);

    return (
        <div className="col-span-2 flex flex-col gap-1.5">
            {error && <div className="text-[11px] text-red-400">{error}</div>}

            <div className="flex items-center gap-1.5 rounded border border-neutral-800 bg-neutral-950 px-2 py-1">
                <div className="min-w-0 flex-1 truncate text-[11px] font-mono text-neutral-300">
                    {value || placeholder || `(no ${KIND_LABEL[kind]} selected)`}
                </div>
                {clearable && value && (
                    <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => onChange('')}
                        className="text-neutral-500 hover:text-red-400"
                        title="Clear"
                    >
                        <X />
                    </Button>
                )}
            </div>

            {!matched && value && (
                <div className="text-[10px] italic text-amber-400">
                    ⚠ current value isn't in the {KIND_LABEL[kind]} index
                </div>
            )}

            {ids.length === 0 && !error && (
                <div className="text-[11px] italic text-neutral-500">
                    (no {KIND_LABEL[kind]} registered)
                </div>
            )}

            <div className="max-h-32 overflow-y-auto rounded border border-neutral-800 bg-neutral-950">
                {ids.map((id) => {
                    const isSelected = id === value;
                    return (
                        <button
                            key={id}
                            type="button"
                            onClick={() => onChange(id)}
                            className={
                                'block w-full truncate px-2 py-1 text-left font-mono text-[11px] transition ' +
                                (isSelected
                                    ? 'bg-cyan-950/50 text-cyan-300'
                                    : 'text-neutral-300 hover:bg-neutral-800')
                            }
                        >
                            {id}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
