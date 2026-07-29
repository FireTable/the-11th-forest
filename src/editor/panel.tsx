import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Brush, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { EventBus } from '@/lib/events/bus';
import { addWall, removeWall, setWallKind } from '@/lib/editor/air-walls';
import { getCurrentLevel } from '@/lib/levels/current-level';
import type { AirWallKind, AirWallVertex, Level } from '@/lib/levels/types';

import { AirWallsSection } from './sections/air-walls';
import { MaterialsSection } from './sections/materials';
import { WallCanvas } from './wall-canvas';

interface ScenePayload {
    id: string;
    level: Level;
}

/**
 * Two-level tab tree.
 *
 * Top level routes between resource kinds (Scenes vs Characters).
 * Scene sub-tabs decide which part of the level is being edited —
 * only Air Walls needs the Konva overlay above the Phaser canvas,
 * Materials / Prompts are pure form UIs.
 */
type TopTab = 'scenes' | 'characters';
type SceneSubTab = 'materials' | 'air-walls' | 'prompts';

const TOP_TABS: { id: TopTab; label: string }[] = [
    { id: 'scenes', label: 'Scenes' },
    { id: 'characters', label: 'Characters' },
];

const SCENE_SUB_TABS: { id: SceneSubTab; label: string }[] = [
    { id: 'materials', label: 'Materials' },
    { id: 'air-walls', label: 'Air walls' },
    { id: 'prompts', label: 'Prompts' },
];



/**
 * Editor panel. Lazy-loaded (see App.tsx) so react-konva and editor UI
 * ship in their own chunk.
 *
 * Reads its initial level from `getCurrentLevel()` (module-level cache
 * the scene writes to) and listens for subsequent `level-loaded` events.
 *
 * Walls are rendered + edited via <WallCanvas> (Konva overlay above the
 * Phaser canvas). This component owns only the side panel UI — kind
 * dropdown, delete, save, etc. — and exposes a `setLevel` callback to
 * the canvas for vertex drag / new wall commits.
 */
export function EditorPanel() {
    const [open, setOpen] = useState(false);
    const [sceneId, setSceneId] = useState<string | null>(null);
    const [level, setLevel] = useState<Level | null>(null);
    const [topTab, setTopTab] = useState<TopTab>('scenes');
    const [sceneSubTab, setSceneSubTab] = useState<SceneSubTab>('air-walls');
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [drawing, setDrawing] = useState(false);
    const [overlayTarget, setOverlayTarget] = useState<HTMLElement | null>(null);

    // Seed from cache (covers the lazy-mount race) and listen for live events.
    useEffect(() => {
        // The Konva overlay must live INSIDE #game-container so it tracks
        // the same display size as the Phaser canvas. Portal it in.
        setOverlayTarget(document.getElementById('game-container'));
    }, []);
    useEffect(() => {
        const cached = getCurrentLevel();
        if (cached) {
            setSceneId(cached.id);
            setLevel(cached.level);
            setDirty(false);
        }
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

    function handleAirWallDrawn(points: AirWallVertex[]) {
        if (!level) return;
        handleLevelChange(addWall(level, 'tall', points));
    }

    function handleAddWall() {
        if (!level) return;
        const cx = Math.round(level.imageSize.width / 2);
        const cy = Math.round(level.imageSize.height / 2);
        const r = Math.round(Math.min(level.imageSize.width, level.imageSize.height) * 0.05);
        handleLevelChange(
            addWall(level, 'tall', [
                [cx - r, cy - r],
                [cx + r, cy - r],
                [cx + r, cy + r],
                [cx - r, cy + r],
            ]),
        );
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
            setDirty(false);
            setSaving(false);
        } catch (e) {
            setError(String((e as Error).message ?? e));
            setSaving(false);
        }
    }

    function toggleOpen() {
        const next = !open;
        setOpen(next);
        // Hubs are Phaser GameObjects drawn on the canvas; React can't
        // touch them directly. Notify the scene via EventBus so the
        // hubs' root containers get hidden / shown alongside the panel.
        EventBus.emit('editor-open', next);
    }

    return (
        <>
            <Button
                onClick={toggleOpen}
                className="fixed bottom-4 left-4 z-[101] bg-cyan-500 hover:bg-cyan-400 text-black font-semibold shadow-lg gap-2"
            >
                {open ? (
                    <>
                        <X className="size-4" />
                        Close
                    </>
                ) : (
                    <>
                        <Brush className="size-4" />
                        Editor
                    </>
                )}
            </Button>
            <aside
                className="w-[360px] h-screen shrink-0 bg-neutral-900 border-l border-neutral-800 text-neutral-100 flex flex-col font-sans text-[13px]"
                hidden={!open}
            >
                <nav className="flex border-b border-neutral-800">
                    {TOP_TABS.map((t) => (
                        <Button
                            key={t.id}
                            variant="ghost"
                            onClick={() => setTopTab(t.id)}
                            className={`flex-1 rounded-none border-b-2 ${
                                topTab === t.id
                                    ? 'border-cyan-400 text-cyan-400'
                                    : 'border-transparent text-neutral-500 hover:text-neutral-300'
                            }`}
                        >
                            {t.label}
                        </Button>
                    ))}
                </nav>
                {topTab === 'scenes' && (
                    <nav className="flex border-b border-neutral-800 bg-neutral-900/60">
                        {SCENE_SUB_TABS.map((t) => (
                            <Button
                                key={t.id}
                                variant="ghost"
                                onClick={() => setSceneSubTab(t.id)}
                                className={`flex-1 rounded-none border-b-2 ${
                                    sceneSubTab === t.id
                                        ? 'border-cyan-400 text-cyan-400'
                                        : 'border-transparent text-neutral-500 hover:text-neutral-300'
                                }`}
                            >
                                {t.label}
                            </Button>
                        ))}
                    </nav>
                )}
                <div className="flex-1 overflow-y-auto p-3">
                    {!level && (
                        <div className="text-neutral-500 italic text-center py-4">
                            Waiting for scene…
                        </div>
                    )}
                    {level && topTab === 'scenes' && sceneSubTab === 'air-walls' && (
                        <AirWallsSection
                            level={level}
                            setLevel={handleLevelChange}
                            drawing={drawing}
                            setDrawing={setDrawing}
                            onAddWall={handleAddWall}
                        />
                    )}
                    {level && topTab === 'scenes' && sceneSubTab === 'materials' && (
                        <MaterialsSection level={level} setLevel={handleLevelChange} />
                    )}
                    {level && topTab === 'scenes' && sceneSubTab === 'prompts' && (
                        <div className="text-neutral-500 italic text-center py-4">
                            Prompts editor — v2
                        </div>
                    )}
                    {topTab === 'characters' && (
                        <div className="text-neutral-500 italic text-center py-4">
                            Characters editor — v2
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
            {/* Konva overlay above the Phaser canvas. Portaled into
                #game-container so it tracks the same display size as
                the Phaser canvas.
                Renders air-walls visually in all Scenes sub-tabs, but only
                enables pointer events / interactions when on the 'air-walls' tab.
                Other tabs (Materials, Prompts) pass pointer events through to Phaser. */}
            {level && overlayTarget && open && topTab === 'scenes' &&
                createPortal(
                    <WallCanvas
                        level={level}
                        drawing={drawing}
                        active={sceneSubTab === 'air-walls'}
                        onLevelChange={handleLevelChange}
                        onAirWallDrawn={handleAirWallDrawn}
                    />,
                    overlayTarget,
                )}
        </>
    );
}

// Internal helper kept here so the section can avoid reaching into Level.
// (Re-exported pattern — small enough to inline; no test target yet.)
// ponytail: keep kind-only mutations here to avoid duplicating the
// list-walking pattern in AirWallsSection for the wall-row dropdown.
export function handleWallKindChange(
    setLevel: (next: Level) => void,
    level: Level,
    id: string,
    kind: AirWallKind,
): void {
    setLevel(setWallKind(level, id, kind));
}

export function handleWallRemove(
    setLevel: (next: Level) => void,
    level: Level,
    id: string,
): void {
    setLevel(removeWall(level, id));
}