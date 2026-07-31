import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Brush, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { EventBus } from '@/lib/events/bus';
import { addWall, removeWall, setWallKind } from '@/lib/editor/air-walls';
import { getCurrentLevel } from '@/lib/levels/current-level';
import type { AirWallKind, AirWallVertex, Level } from '@/lib/levels/types';

import { AirWallsSection } from './sections/air-walls';
import { BackgroundSection } from './sections/background';
import { CharacterSection } from './sections/character';
import { MaterialsSection } from './sections/materials';
import {
    DropsSection,
    MonstersSectionEditor,
    WeaponsSectionEditor,
    AudiosSection,
} from './sections/modules';
import { MonstersSection } from './sections/monsters';
import { ScenesListSection } from './sections/scenes-list';
import { SettingsSection } from './sections/settings';
import { WallCanvas } from './wall-canvas';

interface ScenePayload {
    id: string;
    level: Level;
}

type TopTab = 'scenes' | 'characters' | 'drops' | 'monsters' | 'weapons' | 'audios';
type SceneSubTab = 'scenes' | 'background' | 'settings' | 'monsters' | 'air-walls' | 'materials';

const TOP_TABS: { id: TopTab; label: string }[] = [
    { id: 'scenes', label: 'Scenes' },
    { id: 'characters', label: 'Chars' },
    { id: 'drops', label: 'Drops' },
    { id: 'monsters', label: 'Mobs' },
    { id: 'weapons', label: 'Weaps' },
    { id: 'audios', label: 'Audio' },
];

const SCENE_SUB_TABS: { id: SceneSubTab; label: string }[] = [
    { id: 'scenes', label: 'Scenes' },
    { id: 'background', label: 'Background' },
    { id: 'settings', label: 'Settings' },
    { id: 'monsters', label: 'Monsters' },
    { id: 'air-walls', label: 'Air walls' },
    { id: 'materials', label: 'Materials' },
];

export function EditorPanel() {
    const [open, setOpen] = useState(false);
    const [sceneId, setSceneId] = useState<string | null>(null);
    const [level, setLevel] = useState<Level | null>(null);
    const [topTab, setTopTab] = useState<TopTab>('scenes');
    const [sceneSubTab, setSceneSubTab] = useState<SceneSubTab>('scenes');
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [drawing, setDrawing] = useState(false);
    const [overlayTarget, setOverlayTarget] = useState<HTMLElement | null>(null);

    useEffect(() => {
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

    /**
     * Called from BackgroundSection after it locally mutates the level
     * (new PNG + imageSize). Background changes are part of the level
     * so this delegates to the standard save handler.
     */
    async function handleBackgroundSave() {
        await handleSave();
    }

    /**
     * Called from ScenesListSection after a scene jump — keeps the
     * panel in sync with what the Phaser scene now shows.
     */
    function handleSceneChange(id: string) {
        setSceneId(id);
        // Level payload arrives shortly via 'level-loaded' event.
    }

    function toggleOpen() {
        const next = !open;
        setOpen(next);
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
                    <nav className="flex border-b border-neutral-800 bg-neutral-900/60 overflow-x-auto">
                        {SCENE_SUB_TABS.map((t) => (
                            <Button
                                key={t.id}
                                variant="ghost"
                                onClick={() => setSceneSubTab(t.id)}
                                className={`flex-shrink-0 rounded-none border-b-2 px-3 ${
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
                    {topTab === 'scenes' && sceneSubTab === 'scenes' && (
                        <ScenesListSection
                            currentSceneId={sceneId}
                            onSceneChange={handleSceneChange}
                        />
                    )}
                    {!level && topTab === 'scenes' && sceneSubTab !== 'scenes' && (
                        <div className="text-neutral-500 italic text-center py-4">
                            Waiting for scene…
                        </div>
                    )}
                    {level && topTab === 'scenes' && sceneSubTab === 'background' && (
                        <BackgroundSection
                            sceneId={sceneId!}
                            level={level}
                            setLevel={handleLevelChange}
                            onAfterSave={handleBackgroundSave}
                        />
                    )}
                    {level && topTab === 'scenes' && sceneSubTab === 'settings' && (
                        <SettingsSection level={level} setLevel={handleLevelChange} />
                    )}
                    {level && topTab === 'scenes' && sceneSubTab === 'monsters' && (
                        <MonstersSection
                            sceneId={sceneId!}
                            level={level}
                            setLevel={handleLevelChange}
                        />
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
                    {topTab === 'characters' && <CharacterSection />}
                    {topTab === 'drops' && <DropsSection />}
                    {topTab === 'monsters' && <MonstersSectionEditor />}
                    {topTab === 'weapons' && <WeaponsSectionEditor />}
                    {topTab === 'audios' && <AudiosSection />}
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