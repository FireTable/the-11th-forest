/**
 * src/editor/sections/background.tsx
 * --------------------------------------------------------------------------
 * Scenes → Background sub-tab — replace the current scene's background
 * PNG. After upload, if the natural pixel size differs from the level's
 * `imageSize`, shows a confirm dialog before patching the level.
 */

import { useState, useRef } from 'react';
import { Upload } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import type { Level } from '@/lib/levels/types';

interface UploadResult {
    ok: true;
    path: string;
    naturalSize: { width: number; height: number };
    previousSize: { width: number; height: number } | null;
    sizeChanged: boolean;
}

interface Props {
    sceneId: string;
    level: Level;
    setLevel: (next: Level) => void;
    onAfterSave: () => void;
}

export function BackgroundSection({ sceneId, level, setLevel, onAfterSave }: Props) {
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pendingSizeChange, setPendingSizeChange] = useState<UploadResult | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    async function uploadFile(file: File): Promise<UploadResult> {
        const dataUrl: string = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(new Error('FileReader failed'));
            reader.readAsDataURL(file);
        });
        const res = await fetch('/api/editor/upload-scene-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: sceneId, fileData: dataUrl }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        return body;
    }

    async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        // allow re-selecting the same file
        if (fileInputRef.current) fileInputRef.current.value = '';
        setError(null);
        setUploading(true);
        try {
            const result = await uploadFile(file);
            if (result.sizeChanged) {
                setPendingSizeChange(result);
            } else {
                applyAndSave(result.naturalSize);
            }
        } catch (e) {
            setError(String((e as Error).message ?? e));
        } finally {
            setUploading(false);
        }
    }

    function applyAndSave(size: { width: number; height: number }) {
        // Update background path + imageSize locally, then save full level.
        const next: Level = {
            ...level,
            background: `assets/image/scenes/${sceneId}.png`,
            imageSize: { width: size.width, height: size.height },
        };
        setLevel(next);
        onAfterSave();
    }

    return (
        <div className="flex flex-col gap-3 text-xs">
            {error && <div className="text-red-400 text-[11px]">{error}</div>}

            <div className="bg-neutral-900 border border-neutral-800 rounded p-2.5 flex flex-col gap-2">
                <div className="font-semibold text-neutral-300">Current background</div>
                <div className="text-[11px] text-neutral-400 font-mono break-all">
                    {level.background}
                </div>
                <div className="text-[11px] text-neutral-400">
                    {level.imageSize.width}×{level.imageSize.height}
                </div>
                <div className="bg-neutral-950 border border-neutral-800 rounded p-1">
                    <img
                        src={`/${level.background}`}
                        alt="scene background"
                        className="w-full max-h-48 object-contain"
                    />
                </div>
            </div>

            <div className="bg-neutral-900 border border-neutral-800 rounded p-2.5 flex flex-col gap-2">
                <div className="font-semibold text-neutral-300">Replace background</div>
                <Button
                    size="sm"
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                    className={`h-9 font-medium ${
                        uploading
                            ? 'bg-neutral-800 text-neutral-500'
                            : 'bg-cyan-600 hover:bg-cyan-500 text-white'
                    }`}
                >
                    <Upload className="size-3 mr-1.5" />
                    {uploading ? 'Uploading…' : 'Choose PNG'}
                </Button>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    disabled={uploading}
                    onChange={handleFile}
                    className="hidden"
                />
                <div className="text-[11px] text-neutral-500 italic">
                    Replaces the PNG file. If the new size differs, you'll be asked to confirm the{' '}
                    <code>imageSize</code> change. Air walls are NOT auto-scaled.
                </div>
            </div>

            <Dialog
                open={pendingSizeChange !== null}
                onOpenChange={(open) => {
                    if (!open) setPendingSizeChange(null);
                }}
            >
                <DialogContent className="bg-neutral-900 border-neutral-800 text-neutral-200">
                    <DialogHeader>
                        <DialogTitle className="text-base font-semibold">
                            Background size changed
                        </DialogTitle>
                        <DialogDescription className="text-xs text-neutral-400 pt-1">
                            The new image is{' '}
                            <strong>
                                {pendingSizeChange?.naturalSize.width}×
                                {pendingSizeChange?.naturalSize.height}
                            </strong>{' '}
                            but the level was{' '}
                            <strong>
                                {pendingSizeChange?.previousSize
                                    ? `${pendingSizeChange.previousSize.width}×${pendingSizeChange.previousSize.height}`
                                    : 'unset'}
                            </strong>
                            . Air walls and monster positions will be misaligned until you re-draw
                            them.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="text-[11px] text-neutral-500 italic">
                        Confirm to update <code>imageSize</code>. Cancel to keep the old size (the
                        new PNG will still replace the old one).
                    </div>
                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setPendingSizeChange(null)}
                            className="bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700 text-xs"
                        >
                            Cancel (keep old size)
                        </Button>
                        <Button
                            size="sm"
                            onClick={() => {
                                if (pendingSizeChange) {
                                    applyAndSave(pendingSizeChange.naturalSize);
                                    setPendingSizeChange(null);
                                }
                            }}
                            className="bg-cyan-500 hover:bg-cyan-400 text-black font-semibold text-xs"
                        >
                            Update imageSize
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
