import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { EventBus } from '@/lib/events/bus';
import type { Level } from '@/lib/levels/types';

import { AirWallsSection } from './sections/air-walls';

interface ScenePayload {
    id: string;
    level: Level;
}

type Tab = 'air-walls' | 'prompts';

const TABS: { id: Tab; label: string }[] = [
    { id: 'air-walls', label: 'Air walls' },
    { id: 'prompts', label: 'Prompts' },
];

/**
 * Right-side editor panel. Always shown by default (toggled via the
 * bottom-left floating button). Uses flex layout so the Phaser canvas
 * auto-shrinks to fit — no overlay occluding the level while editing.
 *
 * Listens for `level-loaded` from the running scene to seed its state;
 * edits flow through Save (POST /api/editor/save-level) which triggers
 * a full reload via Vite's public/ watcher.
 */
export function EditorPanel() {
    const [open, setOpen] = useState(true);
    const [sceneId, setSceneId] = useState<string | null>(null);
    const [level, setLevel] = useState<Level | null>(null);
    const [tab, setTab] = useState<Tab>('air-walls');
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        function onLevel(payload: ScenePayload) {
            setSceneId(payload.id);
            setLevel(payload.level);
            setDirty(false);
            setError(null);
        }
        EventBus.on('level-loaded', onLevel);
        return () => EventBus.removeListener('level-loaded', onLevel);
    }, []);

    function handleLevelChange(next: Level) {
        setLevel(next);
        setDirty(true);
        setError(null);
    }

    async function handleSave() {
        if (!level || !sceneId) return;
        setSaving(true);
        setError(null);
        try {
            const res = await fetch('/api/editor/save-level', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: sceneId, level }),
            });
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
            window.location.reload();
        } catch (e) {
            setError(String((e as Error).message ?? e));
            setSaving(false);
        }
    }

    return (
        <>
            <Button
                onClick={() => setOpen((o) => !o)}
                className="fixed bottom-4 left-4 z-[101] bg-cyan-500 hover:bg-cyan-400 text-black font-semibold shadow-lg"
            >
                {open ? '✕ Close' : '⚙ Editor'}
            </Button>
            <aside
                className="w-[360px] h-screen shrink-0 bg-neutral-900 border-l border-neutral-800 text-neutral-100 flex flex-col font-sans text-[13px]"
                hidden={!open}
            >
                <nav className="flex border-b border-neutral-800">
                    {TABS.map((t) => (
                        <Button
                            key={t.id}
                            variant="ghost"
                            onClick={() => setTab(t.id)}
                            className={`flex-1 rounded-none border-b-2 ${
                                tab === t.id
                                    ? 'border-cyan-400 text-cyan-400'
                                    : 'border-transparent text-neutral-500 hover:text-neutral-300'
                            }`}
                        >
                            {t.label}
                        </Button>
                    ))}
                </nav>
                <div className="flex-1 overflow-y-auto p-3">
                    {!level && (
                        <div className="text-neutral-500 italic text-center py-4">
                            Waiting for scene…
                        </div>
                    )}
                    {level && tab === 'air-walls' && (
                        <AirWallsSection level={level} setLevel={handleLevelChange} />
                    )}
                    {level && tab === 'prompts' && (
                        <div className="text-neutral-500 italic text-center py-4">
                            Prompts editor — v2
                        </div>
                    )}
                </div>
                <div className="border-t border-neutral-800 p-3 flex flex-col gap-1.5">
                    {error && <div className="text-red-400 text-[11px]">{error}</div>}
                    <Button
                        disabled={!dirty || saving || !level}
                        onClick={handleSave}
                        className="self-end bg-cyan-500 hover:bg-cyan-400 text-black font-semibold disabled:bg-neutral-700 disabled:text-neutral-500"
                    >
                        {saving ? 'Saving…' : 'Save'}
                    </Button>
                </div>
            </aside>
        </>
    );
}