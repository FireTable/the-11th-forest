import React, { useEffect, useState } from 'react';
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
import { EventBus } from '@/lib/events/bus';
import type { Level, MaterialMode, PlacedMaterial } from '@/lib/levels/types';

interface Props {
    level: Level;
    setLevel: (next: Level) => void;
}

interface MaterialFolder {
    name: string;
    images: string[];
}

export function MaterialsSection({ level, setLevel }: Props) {
    const [folderName, setFolderName] = useState('');
    const [uploading, setUploading] = useState(false);
    const [folders, setFolders] = useState<MaterialFolder[]>([]);
    const [selectedMat, setSelectedMat] = useState<PlacedMaterial | null>(null);
    const [statusMsg, setStatusMsg] = useState('');
    // Collapsed state for material folders (default all expanded)
    const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});

    const toggleFolderCollapse = (folderName: string) => {
        setCollapsedFolders((prev) => ({
            ...prev,
            [folderName]: !prev[folderName],
        }));
    };

    // Dialog state for material asset deletion checks
    const [deleteDialog, setDeleteDialog] = useState<{
        open: boolean;
        imgPath: string;
        blocked: boolean; // true if used in scene
        usageCount: number;
    }>({ open: false, imgPath: '', blocked: false, usageCount: 0 });

    useEffect(() => {
        fetchMaterialsList();

        const onSelected = (mat: unknown) => {
            setSelectedMat(mat ? (mat as PlacedMaterial) : null);
        };
        const onUpdated = (mat: unknown) => {
            if (!mat) return;
            const updated = mat as PlacedMaterial;
            setSelectedMat(updated);

            // Sync into level state
            if (level.materials) {
                const idx = level.materials.findIndex((m) => m.id === updated.id);
                if (idx >= 0) {
                    const nextMats = [...level.materials];
                    nextMats[idx] = { ...updated };
                    setLevel({ ...level, materials: nextMats });
                }
            }
        };

        EventBus.on('material-selected', onSelected);
        EventBus.on('material-updated', onUpdated);
        return () => {
            EventBus.removeListener('material-selected', onSelected);
            EventBus.removeListener('material-updated', onUpdated);
        };
    }, [level]);

    const fetchMaterialsList = async () => {
        try {
            const res = await fetch('/api/editor/list-materials');
            if (res.ok) {
                const data = await res.json();
                setFolders(data.folders || []);
            }
        } catch {
            // Ignore error
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !folderName.trim()) return;

        setUploading(true);
        setStatusMsg('Uploading & slicing sheet…');

        try {
            const reader = new FileReader();
            reader.onload = async () => {
                const base64 = reader.result as string;
                const res = await fetch('/api/editor/upload-material', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        folder: folderName.trim(),
                        fileData: base64,
                    }),
                });

                if (res.ok) {
                    setStatusMsg('Materials sliced successfully!');
                    setFolderName('');
                    await fetchMaterialsList();
                } else {
                    const err = await res.json();
                    setStatusMsg(`Error: ${err.error || 'Failed'}`);
                }
                setUploading(false);
            };
            reader.readAsDataURL(file);
        } catch (err) {
            setStatusMsg(`Error: ${String(err)}`);
            setUploading(false);
        }
    };

    const handlePlaceMaterial = (texturePath: string) => {
        const id = `mat-${Date.now().toString(36)}`;
        const spawnX = Math.round(level.imageSize.width / 2);
        const spawnY = Math.round(level.imageSize.height / 2);

        const newMat: PlacedMaterial = {
            id,
            texture: texturePath,
            x: spawnX,
            y: spawnY,
            mode: 'y-sort',
            depthOffset: 0,
        };

        const nextMats = [...(level.materials || []), newMat];
        setLevel({ ...level, materials: nextMats });

        // Emit to Phaser scene
        EventBus.emit('material-add', newMat);
        setSelectedMat(newMat);
    };

    const handleUpdateSelected = (patch: Partial<PlacedMaterial>) => {
        if (!selectedMat || !level.materials) return;
        const updated = { ...selectedMat, ...patch };
        setSelectedMat(updated);

        const nextMats = level.materials.map((m) => (m.id === updated.id ? updated : m));
        setLevel({ ...level, materials: nextMats });

        // Emit to Phaser scene
        EventBus.emit('material-update-props', updated);
    };

    const handleDeleteSelected = () => {
        if (!selectedMat || !level.materials) return;
        const targetId = selectedMat.id;
        const nextMats = level.materials.filter((m) => m.id !== targetId);
        setLevel({ ...level, materials: nextMats });
        setSelectedMat(null);

        // Emit to Phaser scene
        EventBus.emit('material-delete', targetId);
    };    const handleFolderUpload = async (targetFolder: string, e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !targetFolder.trim()) return;

        setUploading(true);
        setStatusMsg(`Appending materials to ${targetFolder}…`);

        try {
            const reader = new FileReader();
            reader.onload = async () => {
                const base64 = reader.result as string;
                const res = await fetch('/api/editor/upload-material', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        folder: targetFolder.trim(),
                        fileData: base64,
                    }),
                });

                if (res.ok) {
                    setStatusMsg(`Materials appended to ${targetFolder}!`);
                    await fetchMaterialsList();
                } else {
                    const err = await res.json();
                    setStatusMsg(`Error: ${err.error || 'Failed'}`);
                }
                setUploading(false);
            };
            reader.readAsDataURL(file);
        } catch (err) {
            setStatusMsg(`Error: ${String(err)}`);
            setUploading(false);
        }
    };

    const handleDeleteMaterialFile = (imgPath: string, e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent placing into scene when clicking delete
        
        // Check if any material instance in the level uses this asset texture
        const usedInstances = (level.materials || []).filter((m) => m.texture === imgPath);
        if (usedInstances.length > 0) {
            // Block deletion — asset is currently placed in scene
            setDeleteDialog({
                open: true,
                imgPath,
                blocked: true,
                usageCount: usedInstances.length,
            });
            return;
        }

        // Prompt user confirmation using Shadcn Dialog
        setDeleteDialog({
            open: true,
            imgPath,
            blocked: false,
            usageCount: 0,
        });
    };

    const confirmDeleteMaterialFile = async () => {
        const { imgPath, blocked } = deleteDialog;
        if (blocked || !imgPath) return;

        try {
            const res = await fetch('/api/editor/delete-material-item', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imagePath: imgPath }),
            });
            if (res.ok) {
                await fetchMaterialsList();
            }
        } catch {
            // Ignore error
        } finally {
            setDeleteDialog({ open: false, imgPath: '', blocked: false, usageCount: 0 });
        }
    };

    return (
        <div className="flex flex-col gap-4 text-xs">
            {/* Import Section */}
            <div className="bg-neutral-900 border border-neutral-800 rounded p-2.5 flex flex-col gap-2">
                <div className="font-semibold text-neutral-300">Create New Material Pack</div>
                <Input
                    placeholder="Folder name (e.g. ruins, trees)"
                    value={folderName}
                    onChange={(e) => setFolderName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    className="h-8 text-xs bg-neutral-950 border-neutral-700"
                />
                <label
                    className={`flex items-center justify-center h-8 rounded px-3 font-medium transition cursor-pointer text-center ${
                        folderName.trim() && !uploading
                            ? 'bg-cyan-600 hover:bg-cyan-500 text-white'
                            : 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                    }`}
                >
                    <span>{uploading ? 'Processing…' : 'Upload & Slice Image'}</span>
                    <input
                        type="file"
                        accept="image/*"
                        disabled={!folderName.trim() || uploading}
                        onChange={handleFileUpload}
                        className="hidden"
                    />
                </label>
                {statusMsg && <div className="text-[11px] text-neutral-400 italic">{statusMsg}</div>}
            </div>

            {/* Placed Scene Materials List (Accordion style Inspector) */}
            <div className="flex flex-col gap-2 bg-neutral-900 border border-neutral-800 rounded p-2.5">
                <div className="flex items-center justify-between font-semibold text-neutral-300">
                    <span>Scene Placed Materials</span>
                    <span className="text-[10px] text-neutral-500">{level.materials?.length || 0} items</span>
                </div>
                {(!level.materials || level.materials.length === 0) ? (
                    <div className="text-neutral-500 italic text-center py-2 text-[11px]">
                        No materials placed in this level yet
                    </div>
                ) : (
                    <div className="flex flex-col gap-1.5 max-h-80 overflow-y-auto pr-1">
                        {level.materials.map((m) => {
                            const isSelected = selectedMat?.id === m.id;
                            const filename = m.texture.split('/').pop() || m.texture;
                            return (
                                <div
                                    key={m.id}
                                    className={`flex flex-col rounded border transition text-[11px] overflow-hidden ${
                                        isSelected
                                            ? 'bg-neutral-900 border-cyan-500/80 shadow-sm'
                                            : 'bg-neutral-950 border-neutral-800 hover:border-neutral-700'
                                    }`}
                                >
                                    {/* Item Header */}
                                    <div
                                        onClick={() => {
                                            const nextMat = isSelected ? null : m;
                                            setSelectedMat(nextMat);
                                            EventBus.emit('material-select-id', nextMat?.id ?? null);
                                        }}
                                        className={`flex items-center justify-between p-2 cursor-pointer transition ${
                                            isSelected ? 'bg-cyan-950/40 text-cyan-200 font-medium' : 'text-neutral-300'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2 overflow-hidden">
                                            <img
                                                src={`/${m.texture}`}
                                                alt="mat icon"
                                                className="w-5 h-5 object-contain bg-neutral-900 rounded p-0.5"
                                            />
                                            <span className="truncate font-mono text-[11px]">{filename}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 text-[10px] text-neutral-400 shrink-0">
                                            <span className="uppercase text-[9px] bg-neutral-800 px-1 rounded text-neutral-400">
                                                {m.mode || 'y-sort'}
                                            </span>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    const targetId = m.id;
                                                    const nextMats = (level.materials || []).filter((item) => item.id !== targetId);
                                                    setLevel({ ...level, materials: nextMats });
                                                    if (selectedMat?.id === targetId) setSelectedMat(null);
                                                    EventBus.emit('material-delete', targetId);
                                                }}
                                                className="w-4 h-4 rounded text-neutral-500 hover:text-red-400 hover:bg-neutral-800 flex items-center justify-center text-[11px] font-bold transition"
                                                title="Remove this material from scene"
                                            >
                                                ✕
                                            </button>
                                            <span className="text-[11px] ml-0.5">{isSelected ? '▼' : '▶'}</span>
                                        </div>
                                    </div>

                                    {/* Expanded Inspector Form */}
                                    {isSelected && (
                                        <div className="p-2.5 border-t border-neutral-800/80 flex flex-col gap-2 bg-neutral-950/70">
                                            <div className="grid grid-cols-3 gap-1.5">
                                                <div>
                                                    <label className="text-[10px] text-neutral-400">Pos X</label>
                                                    <Input
                                                        type="number"
                                                        value={selectedMat.x}
                                                        onChange={(e) => handleUpdateSelected({ x: Number(e.target.value) })}
                                                        className="h-7 text-xs bg-neutral-900 border-neutral-700"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] text-neutral-400">Pos Y</label>
                                                    <Input
                                                        type="number"
                                                        value={selectedMat.y}
                                                        onChange={(e) => handleUpdateSelected({ y: Number(e.target.value) })}
                                                        className="h-7 text-xs bg-neutral-900 border-neutral-700"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] text-neutral-400">Scale</label>
                                                    <Input
                                                        type="number"
                                                        step="0.1"
                                                        min="0.1"
                                                        value={selectedMat.scale ?? 1}
                                                        onChange={(e) => handleUpdateSelected({ scale: Number(e.target.value) })}
                                                        className="h-7 text-xs bg-neutral-900 border-neutral-700"
                                                    />
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-2">
                                                <div>
                                                    <label className="text-[10px] text-neutral-400">Rotation (°)</label>
                                                    <Input
                                                        type="number"
                                                        step="15"
                                                        value={selectedMat.rotation ?? 0}
                                                        onChange={(e) => handleUpdateSelected({ rotation: Number(e.target.value) })}
                                                        className="h-7 text-xs bg-neutral-900 border-neutral-700"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] text-neutral-400">Flip Mirror</label>
                                                    <div className="flex gap-1.5 pt-0.5">
                                                        <Button
                                                            size="sm"
                                                            variant={selectedMat.flipX ? 'default' : 'outline'}
                                                            onClick={() => handleUpdateSelected({ flipX: !selectedMat.flipX })}
                                                            className="h-6 text-[10px] flex-1 px-1 bg-neutral-800 hover:bg-neutral-700"
                                                        >
                                                            Flip X
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant={selectedMat.flipY ? 'default' : 'outline'}
                                                            onClick={() => handleUpdateSelected({ flipY: !selectedMat.flipY })}
                                                            className="h-6 text-[10px] flex-1 px-1 bg-neutral-800 hover:bg-neutral-700"
                                                        >
                                                            Flip Y
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>

                                            <div>
                                                <div className="flex items-center gap-1">
                                                    <label className="text-[10px] text-neutral-400">Occlusion Mode</label>
                                                    <span
                                                        className="cursor-help text-neutral-400 hover:text-cyan-400 text-[11px] font-bold"
                                                        title="Depth Rules:&#10;• Y-Sort: depth = mat.y (Dynamic 2.5D occlusion with Player/Enemies)&#10;• Background: depth = 10 (Renders on map floor, BELOW characters & bullets)&#10;• Foreground: depth = 10000 (Renders on top, OVER characters & enemies)"
                                                    >
                                                        ❓
                                                    </span>
                                                </div>
                                                <select
                                                    value={selectedMat.mode || 'y-sort'}
                                                    onChange={(e) => handleUpdateSelected({ mode: e.target.value as MaterialMode })}
                                                    className="w-full h-7 text-xs bg-neutral-900 border border-neutral-700 rounded px-1.5 text-neutral-200 mt-0.5"
                                                >
                                                    <option value="y-sort">Y-Sort (Dynamic Depth: mat.Y)</option>
                                                    <option value="background">Background (Floor: depth 10)</option>
                                                    <option value="foreground">Foreground (Top: depth 10000)</option>
                                                </select>
                                            </div>

                                            <div>
                                                <label className="text-[10px] text-neutral-400">Depth Offset</label>
                                                <Input
                                                    type="number"
                                                    value={selectedMat.depthOffset || 0}
                                                    onChange={(e) => handleUpdateSelected({ depthOffset: Number(e.target.value) })}
                                                    className="h-7 text-xs bg-neutral-900 border-neutral-700"
                                                />
                                            </div>

                                            <Button
                                                size="sm"
                                                variant="destructive"
                                                onClick={handleDeleteSelected}
                                                className="mt-1 h-7 text-xs"
                                            >
                                                Delete Material
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Gallery Grid */}
            <div className="flex flex-col gap-3">
                <div className="font-semibold text-neutral-400">Material Library</div>
                {folders.length === 0 ? (
                    <div className="text-neutral-500 italic text-center py-2">No material packs found</div>
                ) : (
                    folders.map((f) => {
                        const isCollapsed = !!collapsedFolders[f.name];
                        return (
                            <div key={f.name} className="flex flex-col gap-1.5 bg-neutral-950 p-2 rounded border border-neutral-800">
                                <div className="font-medium text-neutral-300 capitalize text-[11px] flex justify-between items-center select-none">
                                    <div
                                        onClick={() => toggleFolderCollapse(f.name)}
                                        className="flex items-center gap-1.5 cursor-pointer hover:text-white transition"
                                    >
                                        <span className="text-[10px] text-neutral-500">{isCollapsed ? '▶' : '▼'}</span>
                                        <span>{f.name} ({f.images.length})</span>
                                    </div>
                                    <label className="text-[10px] text-cyan-400 hover:text-cyan-300 cursor-pointer font-semibold">
                                        + Append Sheet
                                        <input
                                            type="file"
                                            accept="image/*"
                                            disabled={uploading}
                                            onChange={(e) => handleFolderUpload(f.name, e)}
                                            className="hidden"
                                        />
                                    </label>
                                </div>

                                {!isCollapsed && (
                                    <div className="grid grid-cols-6 gap-1 max-h-72 overflow-y-auto pr-0.5">
                                        {f.images.map((img) => (
                                            <div
                                                key={img}
                                                onClick={() => handlePlaceMaterial(img)}
                                                className="relative aspect-square bg-neutral-900 border border-neutral-800 hover:border-cyan-500 rounded p-0.5 flex items-center justify-center overflow-hidden transition group cursor-pointer"
                                                title="Click to place into scene"
                                            >
                                                <img
                                                    src={`/${img}`}
                                                    alt="material tile"
                                                    className="max-w-full max-h-full object-contain group-hover:scale-110 transition"
                                                />
                                                <button
                                                    onClick={(e) => handleDeleteMaterialFile(img, e)}
                                                    className="absolute top-0.5 right-0.5 w-3.5 h-3.5 bg-red-600/90 hover:bg-red-500 text-white rounded-full flex items-center justify-center text-[8px] font-bold opacity-0 group-hover:opacity-100 transition shadow"
                                                    title="Delete asset file permanently"
                                                >
                                                    ×
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>

            {/* Delete Confirmation & Usage Warning Dialog */}
            <Dialog
                open={deleteDialog.open}
                onOpenChange={(open: boolean) => {
                    if (!open) setDeleteDialog({ open: false, imgPath: '', blocked: false, usageCount: 0 });
                }}
            >
                <DialogContent
                    onKeyDown={(e) => {
                        if (e.key === ' ' || e.key === 'Spacebar' || e.key === 'Enter') {
                            e.preventDefault();
                            if (deleteDialog.blocked) {
                                setDeleteDialog({ open: false, imgPath: '', blocked: false, usageCount: 0 });
                            } else {
                                confirmDeleteMaterialFile();
                            }
                        }
                    }}
                    className="bg-neutral-900 border-neutral-800 text-neutral-200"
                >
                    <DialogHeader>
                        <DialogTitle className="text-base font-semibold">
                            {deleteDialog.blocked ? '⚠️ Cannot Delete Material' : 'Confirm Asset Deletion'}
                        </DialogTitle>
                        <DialogDescription className="text-xs text-neutral-400 pt-1">
                            {deleteDialog.blocked ? (
                                <span className="text-red-400">
                                    This material is currently placed in the scene ({deleteDialog.usageCount} instance
                                    {deleteDialog.usageCount > 1 ? 's' : ''}). Please remove it from the scene before deleting the file asset.
                                </span>
                            ) : (
                                <span>
                                    Are you sure you want to permanently delete this material asset file from disk? This action cannot be undone.
                                </span>
                            )}
                        </DialogDescription>
                    </DialogHeader>

                    {deleteDialog.imgPath && (
                        <div className="flex items-center gap-3 bg-neutral-950 p-2 rounded border border-neutral-800 my-1 overflow-hidden">
                            <img
                                src={`/${deleteDialog.imgPath}`}
                                alt="preview"
                                className="w-10 h-10 object-contain bg-neutral-900 rounded p-1 shrink-0"
                            />
                            <span className="text-xs font-mono text-neutral-300 break-all min-w-0 leading-tight">
                                {deleteDialog.imgPath}
                            </span>
                        </div>
                    )}

                    <DialogFooter className="gap-2 sm:gap-0">
                        {deleteDialog.blocked ? (
                            <Button
                                size="sm"
                                autoFocus
                                onClick={() => setDeleteDialog({ open: false, imgPath: '', blocked: false, usageCount: 0 })}
                                className="bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs"
                            >
                                Got it
                            </Button>
                        ) : (
                            <>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setDeleteDialog({ open: false, imgPath: '', blocked: false, usageCount: 0 })}
                                    className="bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700 text-xs"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    size="sm"
                                    autoFocus
                                    variant="destructive"
                                    onClick={confirmDeleteMaterialFile}
                                    className="bg-red-600 hover:bg-red-500 text-white text-xs"
                                >
                                    Delete Asset
                                </Button>
                            </>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
