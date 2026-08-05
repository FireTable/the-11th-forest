/**
 * src/editor/sections/sprite-editor.tsx
 * --------------------------------------------------------------------------
 * Shared sprite-sheet + anims editor used by both Characters and
 * Monsters (and any future module whose spec has `sprite.grid` +
 * `anims` shape). Two pieces:
 *
 *   <SpriteUploader /> — preview + "Upload & process" button + grid /
 *     scale / imageSize inputs. Calls the upload endpoint the caller
 *     provides and fills in defaults for whatever fields aren't
 *     already set on the spec.
 *
 *   <AnimsEditor /> — visual frame picker + per-anim frame / rate /
 *     repeat inputs. Two-click UX: first click anchors, second click
 *     locks the range.
 *
 * Keeping these in one file means Character and Monster stay in sync
 * — there is no "character editor drift" or "monster editor drift",
 * any tweak lands in both modules automatically.
 */

import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from './fields';
import { NumberField } from './fields';
import { SpritePicker } from '@/editor/asset-picker';

// ─── Shared sprite type ──────────────────────────────────────────────────
// Both CharacterSpec.sprite and MonsterSpec.sprite share the { texture,
// grid, scale, offset? } core that the editor manipulates. Modules with
// extra fields (e.g. CharacterSpec adds `script`, MonsterSpec adds
// `prompt`) cast to this through `as` at the call site.
export interface SpriteSpec {
    texture: string;
    grid: { rows: number; cols: number };
    scale: number;
    offset?: { left?: number; bottom?: number; x?: number; y?: number };
}

export interface AnimSpec {
    frames: [number, number];
    frameRate: number;
    repeat: number;
}

// ─── Sprite uploader ─────────────────────────────────────────────────────

export interface SpriteUploaderProps {
    id: string;
    sprite: SpriteSpec | undefined;
    /** Module-specific image-size field (e.g. character.imageSize). */
    imageSize?: string | null;
    /** Patch callbacks. Modules call their own onPatch wrapper to
     *  route through the spec merge logic. */
    onSpriteChange: (s: SpriteSpec) => void;
    onImageSizeChange?: (s: string) => void;
    /** upload URL — '/api/editor/upload-character-sprite' or the
     *  monster equivalent. The server is responsible for writing the
     *  PNG + calling split-sheet.ts. */
    uploadEndpoint: string;
    /** Extra split-sheet options (downsample / colors / etc.) sent
     *  through to the server. */
    uploadOptions?: Record<string, unknown>;
    /** Default values applied to fields that aren't already set when
     *  the upload response lands. */
    defaults: {
        grid?: { rows: number; cols: number };
        scale?: number;
        offset?: { left?: number; bottom?: number };
    };
    /** Folder passed to SpritePicker (e.g. 'characters' / 'monsters'). */
    spriteFolder: 'characters' | 'monsters';
    /** Sprite key on the asset folder; used for the alt label. */
    altLabel: string;
}

export function SpriteUploader({
    id,
    sprite,
    imageSize,
    onSpriteChange,
    onImageSizeChange,
    uploadEndpoint,
    uploadOptions = {},
    defaults,
    spriteFolder,
    altLabel,
}: SpriteUploaderProps) {
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

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
            const res = await fetch(uploadEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id,
                    fileData: dataUrl,
                    options: uploadOptions,
                }),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error);
            // Auto-fill sprite block from server response + spec defaults.
            onSpriteChange({
                texture: body.path,
                grid: sprite?.grid ?? defaults.grid ?? { rows: 4, cols: 4 },
                scale: sprite?.scale ?? defaults.scale ?? 1.0,
                offset: sprite?.offset ?? defaults.offset,
            });
            // Update imageSize to match natural size of the processed sheet.
            if (onImageSizeChange && body.naturalSize) {
                onImageSizeChange(`${body.naturalSize.width}x${body.naturalSize.height}`);
            }
        } catch (e) {
            setError(String((e as Error).message ?? e));
        } finally {
            setUploading(false);
        }
    }

    return (
        <div className="col-span-2 flex flex-col gap-2">
            {error && <div className="text-red-400 text-[11px]">{error}</div>}
            {sprite ? (
                <div className="bg-neutral-950 border border-neutral-800 rounded p-2">
                    <img
                        src={`/${sprite.texture}`}
                        alt={`${altLabel} sprite`}
                        className="w-full max-h-48 object-contain bg-neutral-900"
                    />
                </div>
            ) : (
                <div className="text-neutral-500 italic text-center py-2 text-[11px]">
                    No sprite uploaded yet.
                </div>
            )}
            <Button
                size="sm"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className={`h-8 font-medium ${
                    uploading
                        ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                        : 'bg-cyan-600 hover:bg-cyan-500 text-white'
                }`}
            >
                <Upload className="size-3 mr-1.5" />
                {uploading ? 'Processing…' : 'Upload & process sprite'}
            </Button>
            <input
                ref={fileInputRef}
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
            {sprite && (
                <div className="grid grid-cols-4 gap-1.5">
                    <NumberField
                        label="rows"
                        value={sprite.grid.rows}
                        onChange={(v) =>
                            onSpriteChange({ ...sprite, grid: { ...sprite.grid, rows: v } })
                        }
                    />
                    <NumberField
                        label="cols"
                        value={sprite.grid.cols}
                        onChange={(v) =>
                            onSpriteChange({ ...sprite, grid: { ...sprite.grid, cols: v } })
                        }
                    />
                    <NumberField
                        label="scale"
                        value={sprite.scale}
                        step={0.1}
                        onChange={(v) => onSpriteChange({ ...sprite, scale: v })}
                    />
                    <div className="col-span-4">
                        <SpritePicker
                            folder={spriteFolder}
                            value={sprite.texture}
                            onChange={(v) => onSpriteChange({ ...sprite, texture: v })}
                        />
                    </div>
                    {onImageSizeChange && (
                        <Field label="imageSize">
                            <Input
                                value={imageSize ?? ''}
                                onChange={(e) => onImageSizeChange(e.target.value)}
                                placeholder="WxH"
                                className="h-7 text-xs bg-neutral-950 border-neutral-700"
                            />
                        </Field>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── Anims editor ────────────────────────────────────────────────────────

export function AnimsEditor({
    anims,
    onChange,
    sprite,
}: {
    anims: Record<string, AnimSpec>;
    onChange: (next: Record<string, AnimSpec>) => void;
    sprite?: SpriteSpec;
}) {
    const [newName, setNewName] = useState('');
    const [activeName, setActiveName] = useState<string | null>(null);
    const [pickStart, setPickStart] = useState<number | null>(null);
    const [pickEnd, setPickEnd] = useState<number | null>(null);
    const entries = Object.entries(anims);

    function handleCellClick(idx: number) {
        // Two-click UX: first click anchors, second click locks the
        // range from anchor to clicked cell. Third click re-anchors.
        if (pickStart === null) {
            setPickStart(idx);
            setPickEnd(idx);
        } else if (pickEnd === pickStart) {
            const lo = Math.min(pickStart, idx);
            const hi = Math.max(pickStart, idx);
            setPickStart(lo);
            setPickEnd(hi);
        } else {
            setPickStart(idx);
            setPickEnd(idx);
        }
    }

    function commitPick() {
        if (pickStart === null || pickEnd === null) return;
        const name = newName.trim();
        if (!name) return;
        if (anims[name]) return;
        const lo = Math.min(pickStart, pickEnd);
        const hi = Math.max(pickStart, pickEnd);
        onChange({ ...anims, [name]: { frames: [lo, hi], frameRate: 8, repeat: -1 } });
        setActiveName(name);
        setNewName('');
        setPickStart(null);
        setPickEnd(null);
    }

    return (
        <div className="col-span-2 flex flex-col gap-2">
            {sprite && (
                <FramePicker
                    sprite={sprite}
                    anims={anims}
                    activeName={activeName}
                    pickStart={pickStart}
                    pickEnd={pickEnd}
                    onCellClick={handleCellClick}
                    onAnimClick={setActiveName}
                />
            )}

            <div className="flex flex-col gap-1.5">
                {entries.map(([name, a]) => {
                    const isActive = activeName === name;
                    return (
                        <div
                            key={name}
                            onClick={() => setActiveName(name)}
                            className={`border rounded bg-neutral-950 p-2 cursor-pointer ${
                                isActive
                                    ? 'border-cyan-500/60 bg-cyan-950/30'
                                    : 'border-neutral-800'
                            }`}
                        >
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-neutral-300 font-medium text-[11px]">
                                    {name} · frames {a.frames[0]}–{a.frames[1]}
                                </span>
                                <Button
                                    variant="ghost"
                                    size="icon-xs"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const { [name]: _omit, ...rest } = anims;
                                        void _omit;
                                        onChange(rest);
                                        if (activeName === name) setActiveName(null);
                                    }}
                                    className="text-red-400 hover:text-red-300 hover:bg-transparent"
                                >
                                    <span className="text-[10px] leading-none">✕</span>
                                </Button>
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
                                    onChange={(v) =>
                                        onChange({ ...anims, [name]: { ...a, frameRate: v } })
                                    }
                                />
                                <NumberField
                                    label="repeat"
                                    value={a.repeat}
                                    onChange={(v) =>
                                        onChange({ ...anims, [name]: { ...a, repeat: v } })
                                    }
                                />
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="border border-neutral-800 rounded bg-neutral-950 p-2 flex flex-col gap-1.5">
                <div className="text-[10px] text-neutral-400 uppercase tracking-wider">
                    Add new anim by picking frames
                </div>
                <div className="flex items-center gap-1.5">
                    <Input
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="anim-name (e.g. dodge)"
                        className="h-7 text-xs bg-neutral-900 border-neutral-700 flex-1"
                    />
                    <Button
                        size="sm"
                        disabled={
                            pickStart === null ||
                            pickEnd === null ||
                            !newName.trim() ||
                            !!anims[newName.trim()]
                        }
                        onClick={commitPick}
                        className="h-7 px-3 text-[10px] bg-cyan-600 hover:bg-cyan-500 text-white disabled:bg-neutral-700 disabled:text-neutral-500"
                    >
                        Add anim
                    </Button>
                </div>
                <div className="text-[10px] text-neutral-500 italic">
                    {!sprite
                        ? 'Upload a sprite sheet first to enable frame picking.'
                        : pickStart === null
                          ? 'Click a cell on the sheet above to mark the first frame.'
                          : pickEnd === null || pickStart === pickEnd
                            ? `Start = ${pickStart}. Click another cell to set the end frame.`
                            : `Range = ${Math.min(pickStart, pickEnd)}–${Math.max(
                                  pickStart,
                                  pickEnd,
                              )}. Type a name + Add.`}
                </div>
                {(pickStart !== null || pickEnd !== null) && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                            setPickStart(null);
                            setPickEnd(null);
                        }}
                        className="self-start h-6 px-2 text-[10px] text-neutral-500 hover:text-neutral-300 hover:bg-transparent"
                    >
                        Clear pick
                    </Button>
                )}
            </div>
        </div>
    );
}

// ─── Frame picker (visual grid) ──────────────────────────────────────────

interface FramePickerProps {
    sprite: SpriteSpec;
    anims: Record<string, AnimSpec>;
    activeName: string | null;
    pickStart: number | null;
    pickEnd: number | null;
    onCellClick: (idx: number) => void;
    onAnimClick: (name: string) => void;
}

/**
 * Visual frame picker. Renders the processed sprite sheet, overlays a
 * grid sized to sprite.grid.{rows, cols}, and lets the user pick
 * frames by clicking cells.
 *
 * Cell order matches Phaser's convention: left-to-right, top-to-bottom
 * (frame index = row * cols + col). Cells in saved anims are tinted
 * green; the active anim is highlighted in cyan; the current pick is
 * highlighted in yellow.
 */
function FramePicker({
    sprite,
    anims,
    activeName,
    pickStart,
    pickEnd,
    onCellClick,
    onAnimClick,
}: FramePickerProps) {
    const { rows, cols } = sprite.grid;
    const total = rows * cols;
    const pickLo = pickStart !== null && pickEnd !== null ? Math.min(pickStart, pickEnd) : -1;
    const pickHi = pickStart !== null && pickEnd !== null ? Math.max(pickStart, pickEnd) : -1;
    const activeRange =
        activeName && anims[activeName]
            ? { lo: anims[activeName].frames[0], hi: anims[activeName].frames[1] }
            : null;

    function colorForCell(idx: number): string {
        if (pickLo >= 0 && idx >= pickLo && idx <= pickHi) {
            return 'rgba(255, 220, 80, 0.45)'; // pick — yellow
        }
        if (activeRange && idx >= activeRange.lo && idx <= activeRange.hi) {
            return 'rgba(80, 200, 255, 0.45)'; // active anim — cyan
        }
        for (const [, a] of Object.entries(anims)) {
            if (idx >= a.frames[0] && idx <= a.frames[1]) {
                return 'rgba(80, 220, 120, 0.30)'; // any anim — green
            }
        }
        return 'transparent';
    }

    return (
        <div className="border border-neutral-800 rounded bg-neutral-950 p-2 flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-[10px] text-neutral-400 uppercase tracking-wider">
                <span>Sprite · pick frames</span>
                <span>
                    {rows}×{cols} = {total} cells
                </span>
            </div>
            <div
                className="relative w-full bg-neutral-900 border border-neutral-800 rounded overflow-hidden"
                style={{
                    aspectRatio: `${cols} / ${rows}`,
                }}
            >
                <img
                    src={`/${sprite.texture}`}
                    alt="sprite sheet"
                    className="absolute inset-0 w-full h-full object-contain pixelated"
                    style={{ imageRendering: 'pixelated' }}
                    draggable={false}
                />
                <div
                    className="absolute inset-0 grid"
                    style={{
                        gridTemplateColumns: `repeat(${cols}, 1fr)`,
                        gridTemplateRows: `repeat(${rows}, 1fr)`,
                    }}
                >
                    {Array.from({ length: total }, (_, idx) => (
                        <button
                            key={idx}
                            type="button"
                            onClick={() => onCellClick(idx)}
                            title={`frame ${idx}`}
                            className="border border-cyan-500/20 hover:border-cyan-400/80 transition relative group"
                            style={{
                                backgroundColor: colorForCell(idx),
                            }}
                        >
                            <span className="absolute top-0 left-0 text-[8px] font-mono text-cyan-300/80 px-0.5 leading-none group-hover:text-cyan-100">
                                {idx}
                            </span>
                        </button>
                    ))}
                </div>
            </div>
            <div className="flex items-center gap-2 text-[10px]">
                <Swatch color="rgba(255, 220, 80, 0.45)" label="current pick" />
                <Swatch color="rgba(80, 200, 255, 0.45)" label="active anim" />
                <Swatch color="rgba(80, 220, 120, 0.30)" label="any anim" />
            </div>
            <div className="flex flex-wrap gap-1.5">
                {Object.entries(anims).map(([name, a]) => (
                    <button
                        key={name}
                        type="button"
                        onClick={() => onAnimClick(name)}
                        className={`px-2 py-1 rounded text-[10px] font-mono border ${
                            activeName === name
                                ? 'bg-cyan-950 border-cyan-500 text-cyan-200'
                                : 'bg-neutral-900 border-neutral-700 text-neutral-300 hover:border-neutral-500'
                        }`}
                    >
                        {name} [{a.frames[0]}–{a.frames[1]}]
                    </button>
                ))}
            </div>
        </div>
    );
}

function Swatch({ color, label }: { color: string; label: string }) {
    return (
        <div className="flex items-center gap-1">
            <span
                className="inline-block w-3 h-3 rounded border border-neutral-700"
                style={{ backgroundColor: color }}
            />
            <span>{label}</span>
        </div>
    );
}