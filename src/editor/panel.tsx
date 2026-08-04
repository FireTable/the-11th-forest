import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Brush, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { isDev } from '@/lib/dev/cheats';
import { EventBus } from '@/lib/events/bus';
import { addWall, removeWall, setWallKind } from '@/lib/editor/air-walls';
import { getCurrentLevel } from '@/lib/levels/current-level';
import { isMobileLike } from '@/lib/mobile';
import type { AirWallKind, AirWallVertex, Level } from '@/lib/levels/types';

import { AirWallsSection } from './sections/air-walls';
import { CharacterSection, type CharacterSaveState } from './sections/character';
import { CheatPanel } from './cheat-panel';
import { MaterialsSection } from './sections/materials';
import {
    DropsSection,
    MonstersSectionEditor,
    WeaponsSectionEditor,
    AudiosSection,
    type ModuleSaveState,
} from './sections/modules';
import { MonstersSection } from './sections/monsters';
import { ScenesListSection } from './sections/scenes-list';
import { WallCanvas } from './wall-canvas';

interface ScenePayload {
    id: string;
    level: Level;
}

type TopTab = 'scenes' | 'characters' | 'drops' | 'monsters' | 'weapons' | 'audios';
type SceneSubTab = 'scenes' | 'monsters' | 'air-walls' | 'materials';

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
    { id: 'monsters', label: 'Monsters' },
    { id: 'air-walls', label: 'Air walls' },
    { id: 'materials', label: 'Materials' },
];

export function EditorPanel() {
    // Gate the entire editor surface — including the toggle button and
    // sidebar — to dev builds. The /api/editor/* endpoints live in a
    // Vite plugin that only exists in `vite dev`, so exposing the UI
    // in prod would surface a broken UI (read endpoints 404, saves 404).
    // Mobile is excluded too: a 360px sidebar doesn't fit a phone and
    // the toggle button lands right on top of the joystick.
    if (!isDev() || isMobileLike()) return null;

    const [open, setOpen] = useState(false);

    // Phaser's keyboard plugin attaches a bubble-phase window listener
    // that calls preventDefault on game keys (W/A/S/D, arrows, R, H,
    // S, space, etc.) before the browser's default action runs. When an
    // editor input is focused and the user types one of those letters,
    // the character never gets inserted. Register a capture-phase
    // window keydown listener for the duration the editor is open and
    // stopPropagation on the input case — capture phase fires before
    // the input's own listeners and before the default action, so the
    // input still receives the key (target phase is unaffected) but
    // Phaser's bubble listener never sees it. For non-input targets
    // we leave the event alone so browser shortcuts (Cmd+Tab, F12)
    // still work.
    useEffect(() => {
        const swallow = (e: KeyboardEvent) => {
            const t = e.target as HTMLElement | null;
            if (!t) return;
            if (
                t.tagName === 'INPUT' ||
                t.tagName === 'TEXTAREA' ||
                t.isContentEditable
            ) {
                e.stopPropagation();
            }
        };
        if (open) {
            window.addEventListener('keydown', swallow, true);
        }
        return () => {
            window.removeEventListener('keydown', swallow, true);
        };
    }, [open]);
    const [sceneId, setSceneId] = useState<string | null>(null);
    const [level, setLevel] = useState<Level | null>(null);
    const [topTab, setTopTab] = useState<TopTab>('scenes');
    const [sceneSubTab, setSceneSubTab] = useState<SceneSubTab>('scenes');
    /**
     * Which scene row is expanded inline to show its Background + Settings.
     * Lives in the panel rather than the scene list because the
     * expansion should follow the *current* scene: jump to a scene
     * also expands it. Click the same row again to collapse; switching
     * entities via the sub-tab does not collapse.
     */
    const [expandedSceneId, setExpandedSceneId] = useState<string | null>(null);
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [drawing, setDrawing] = useState(false);
    const [overlayTarget, setOverlayTarget] = useState<HTMLElement | null>(null);
    // The character / module shell sections report their dirty/saving
    // state here so the single outer Save button can dispatch. Null
    // when the current top-tab section has nothing pending.
    const [characterSaveState, setCharacterSaveState] = useState<CharacterSaveState | null>(null);
    const [moduleSaveState, setModuleSaveState] = useState<ModuleSaveState | null>(null);

    // When the top-tab changes, drop any stale save state from the
    // previous section so the outer Save button doesn't think there's
    // pending work for an entity we just navigated away from.
    useEffect(() => {
        setCharacterSaveState(null);
        setModuleSaveState(null);
        setError(null);
    }, [topTab]);

    // Tell the Phaser scene which editor sub-tab is active so the
    // material sprites only become draggable while the user is on
    // the Materials tab — picking Walls or Monsters must not let the
    // user accidentally move material art around the canvas.
    useEffect(() => {
        const isMaterialTab = open && topTab === 'scenes' && sceneSubTab === 'materials';
        EventBus.emit('editor-material-tab-active', isMaterialTab);
    }, [open, topTab, sceneSubTab]);

    // Aggregate dirty / saving across all entities the panel can save.
    // Only one source is ever active at a time, so OR is correct.
    const isAnyDirty = dirty || characterSaveState?.dirty || moduleSaveState?.dirty;
    const isAnySaving = saving || characterSaveState?.saving || moduleSaveState?.saving;

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
        // Dispatch to whichever entity is currently dirty. Only one can
        // be dirty at a time — the user edits either the level (scenes
        // tab) or one character/module (other tabs), never both.
        if (topTab === 'scenes') {
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
            return;
        }
        if (topTab === 'characters' && characterSaveState?.dirty) {
            await characterSaveState.save();
            return;
        }
        if (
            (topTab === 'drops' ||
                topTab === 'monsters' ||
                topTab === 'weapons' ||
                topTab === 'audios') &&
            moduleSaveState?.dirty
        ) {
            await moduleSaveState.save();
            return;
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
                className="w-[360px] h-screen shrink-0 bg-neutral-900 border-l border-neutral-800 text-neutral-100 flex flex-col font-sans text-[13px] relative z-[200]"
                hidden={!open}
            >
                <nav className="flex border-b border-neutral-800">
                    {TOP_TABS.map((t) => (
                        <Button
                            key={t.id}
                            variant="ghost"
                            onClick={() => setTopTab(t.id)}
                            className={`flex-1 rounded-none border-b-2 ${topTab === t.id
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
                                className={`flex-shrink-0 rounded-none border-b-2 px-3 ${sceneSubTab === t.id
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
                            level={level}
                            setLevel={handleLevelChange}
                            expandedSceneId={expandedSceneId}
                            onToggleExpand={setExpandedSceneId}
                            onAfterBackgroundSave={handleBackgroundSave}
                        />
                    )}
                    {topTab === 'scenes' && sceneSubTab !== 'scenes' && !level && (
                        <div className="text-neutral-500 italic text-center py-4">
                            Waiting for scene…
                        </div>
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
                    {topTab === 'characters' && (
                        <CharacterSection onSaveStateChange={setCharacterSaveState} />
                    )}
                    {topTab === 'drops' && <DropsSection onSaveStateChange={setModuleSaveState} />}
                    {topTab === 'monsters' && (
                        <MonstersSectionEditor onSaveStateChange={setModuleSaveState} />
                    )}
                    {topTab === 'weapons' && (
                        <WeaponsSectionEditor onSaveStateChange={setModuleSaveState} />
                    )}
                    {topTab === 'audios' && (
                        <AudiosSection onSaveStateChange={setModuleSaveState} />
                    )}
                </div>
                <div className="border-t border-neutral-800 p-3 flex flex-col gap-1.5">
                    {(error ?? moduleSaveState?.error ?? characterSaveState?.error) && (
                        <div className="text-red-400 text-[11px]">
                            {error ?? moduleSaveState?.error ?? characterSaveState?.error}
                        </div>
                    )}
                    <Button
                        disabled={!isAnyDirty || isAnySaving || (topTab === 'scenes' && !level)}
                        onClick={handleSave}
                        className="self-end bg-cyan-500 hover:bg-cyan-400 text-black font-semibold disabled:bg-neutral-700 disabled:text-neutral-500"
                    >
                        {isAnySaving ? 'Saving…' : 'Save'}
                    </Button>
                </div>
                <CheatPanel />
            </aside>
            {level &&
                overlayTarget &&
                open &&
                topTab === 'scenes' &&
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

export function handleWallRemove(setLevel: (next: Level) => void, level: Level, id: string): void {
    setLevel(removeWall(level, id));
}
