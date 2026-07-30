/**
 * src/editor/sections/scenes-list.tsx
 * --------------------------------------------------------------------------
 * Scenes sub-tab — list every scene in index.yaml, jump to it (in-Phaser
 * restart), create a new scene.
 */

import { useEffect, useState } from 'react';
import { ArrowRight, Plus } from 'lucide-react';

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
import { resolveAndRestart } from '@/lib/phaser-game';

interface SceneRow {
    id: string;
    title: string;
}

interface Props {
    currentSceneId: string | null;
    onSceneChange: (id: string) => void;
}

export function ScenesListSection({ currentSceneId, onSceneChange }: Props) {
    const [scenes, setScenes] = useState<SceneRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [newOpen, setNewOpen] = useState(false);
    const [newId, setNewId] = useState('');
    const [newTitle, setNewTitle] = useState('');
    const [creating, setCreating] = useState(false);
    const [jumpingTo, setJumpingTo] = useState<string | null>(null);

    useEffect(() => {
        refresh();
    }, []);

    async function refresh() {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/editor/list-scenes');
            const body = await res.json();
            if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
            setScenes(body.scenes ?? []);
        } catch (e) {
            setError(String((e as Error).message ?? e));
        } finally {
            setLoading(false);
        }
    }

    async function jumpTo(id: string) {
        setJumpingTo(id);
        try {
            await resolveAndRestart(id);
            onSceneChange(id);
        } catch (e) {
            setError(`Failed to jump: ${(e as Error).message ?? e}`);
        } finally {
            setJumpingTo(null);
        }
    }

    async function handleCreate() {
        const id = newId.trim();
        if (!id) return;
        setCreating(true);
        setError(null);
        try {
            const res = await fetch('/api/editor/create-scene', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, title: newTitle.trim() || id }),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
            setNewOpen(false);
            setNewId('');
            setNewTitle('');
            await refresh();
            // jump to the new scene
            await jumpTo(id);
        } catch (e) {
            setError(String((e as Error).message ?? e));
        } finally {
            setCreating(false);
        }
    }

    return (
        <div className="flex flex-col gap-3 text-xs">
            {error && <div className="text-red-400 text-[11px]">{error}</div>}

            <div className="flex items-center justify-between">
                <div className="font-semibold text-neutral-300">Scenes</div>
                <Button
                    size="sm"
                    className="gap-1 bg-cyan-500 hover:bg-cyan-400 text-black font-semibold h-7 text-xs"
                    onClick={() => setNewOpen(true)}
                >
                    <Plus className="size-3" />
                    New
                </Button>
            </div>

            {loading && <div className="text-neutral-500 italic">Loading…</div>}
            {!loading && scenes.length === 0 && (
                <div className="text-neutral-500 italic text-center py-4">
                    No scenes in index.yaml.
                </div>
            )}

            <div className="flex flex-col gap-1">
                {scenes.map((s) => {
                    const isCurrent = s.id === currentSceneId;
                    const jumping = jumpingTo === s.id;
                    return (
                        <div
                            key={s.id}
                            className={`flex items-center gap-2 border rounded px-2 py-1.5 ${
                                isCurrent
                                    ? 'bg-cyan-950/40 border-cyan-500/60 text-cyan-200'
                                    : 'bg-neutral-900 border-neutral-800 text-neutral-300'
                            }`}
                        >
                            <div className="flex-1 min-w-0">
                                <div className="font-medium truncate text-[12px]">{s.title}</div>
                                <div className="text-[10px] font-mono text-neutral-500 truncate">
                                    {s.id}
                                </div>
                            </div>
                            <Button
                                size="sm"
                                variant={isCurrent ? 'default' : 'outline'}
                                disabled={isCurrent || jumping}
                                onClick={() => jumpTo(s.id)}
                                className={`h-6 text-[10px] gap-1 px-2 ${
                                    isCurrent
                                        ? 'bg-cyan-500 text-black font-semibold'
                                        : 'bg-transparent border-neutral-700'
                                }`}
                                title={isCurrent ? 'Currently loaded' : 'Jump to this scene'}
                            >
                                {jumping ? 'Loading…' : isCurrent ? 'Active' : 'Jump'}
                                {!isCurrent && !jumping && <ArrowRight className="size-3" />}
                            </Button>
                        </div>
                    );
                })}
            </div>

            <Dialog open={newOpen} onOpenChange={setNewOpen}>
                <DialogContent className="bg-neutral-900 border-neutral-800 text-neutral-200">
                    <DialogHeader>
                        <DialogTitle className="text-base font-semibold">New Scene</DialogTitle>
                        <DialogDescription className="text-xs text-neutral-400 pt-1">
                            Creates an empty level yaml + appends to <code>levels/index.yaml</code>.
                            You'll be jumped to it immediately.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex flex-col gap-2">
                        <div>
                            <label className="text-[11px] text-neutral-400">
                                ID (kebab-case, used as filename)
                            </label>
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
                                placeholder="ruined-garden"
                                className="h-8 text-xs bg-neutral-950 border-neutral-700 mt-0.5"
                            />
                        </div>
                        <div>
                            <label className="text-[11px] text-neutral-400">
                                Title (shown in HUD)
                            </label>
                            <Input
                                value={newTitle}
                                onChange={(e) => setNewTitle(e.target.value)}
                                placeholder="Ruined Garden"
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
                            {creating ? 'Creating…' : 'Create & jump'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}