import { Suspense, lazy } from 'react';

import { PhaserGame } from '@/PhaserGame';
import { GameHUDLayer } from '@/components/hud/GameHUDLayer';
import { PixelCrosshair } from '@/components/hud/PixelCrosshair';
import { TouchControls } from '@/components/hud/TouchControls';
import { useGameStore } from '@/store/game-store';

/**
 * Top-level React component.
 *
 * PhaserGame is in the main bundle (it owns the canvas lifecycle).
 * EditorPanel is lazy-loaded so its dependencies — most importantly the
 * ~100KB of react-konva — ship in a separate chunk that is only fetched
 * when the panel actually mounts. Until then the user pays nothing.
 *
 * The editor reads its initial level from `@/lib/levels/current-level`
 * (a tiny module-level singleton the scene writes to) so the lazy
 * chunk can mount after `level-loaded` has already fired without
 * missing the data.
 *
 * CheatPanel lives inside the editor sidebar (see `EditorPanel`) so it
 * shares the same surface — no separate floating widget at the app
 * root.
 *
 * TavernHud is lazy-loaded and only mounted while the tavern scene is
 * active (tavernCleared === false). It receives character-focus events
 * from TavernController via EventBus and shows the selection panel.
 */
const EditorPanel = lazy(() => import('@/editor/panel').then((m) => ({ default: m.EditorPanel })));
const TavernHud   = lazy(() => import('@/components/hud/TavernHud').then((m) => ({ default: m.TavernHud })));
const WeaponReplaceHub = lazy(() =>
    import('@/components/hud/WeaponReplaceHub').then((m) => ({ default: m.WeaponReplaceHub })),
);

function App() {
    const tavernCleared = useGameStore((s) => s.tavernCleared);

    return (
        // Layout lives in index.css (#app). No Tailwind utilities here:
        // they would out-rank the forced-landscape media query.
        <div id="app">
            <PhaserGame />
            <GameHUDLayer />
            {!tavernCleared && (
                <Suspense fallback={null}>
                    <TavernHud />
                </Suspense>
            )}
            <Suspense fallback={null}>
                <WeaponReplaceHub />
            </Suspense>
            <Suspense fallback={null}>
                <EditorPanel />
            </Suspense>
            <PixelCrosshair />
            <TouchControls />
        </div>
    );
}

export default App;
