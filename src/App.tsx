import { Suspense, lazy } from 'react';

import { PhaserGame } from '@/PhaserGame';
import { GameHUDLayer } from '@/components/hud/GameHUDLayer';
import { PixelCrosshair } from '@/components/hud/PixelCrosshair';
import { RotateOverlay } from '@/components/hud/RotateOverlay';
import { TouchControls } from '@/components/hud/TouchControls';

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
 */
const EditorPanel = lazy(() => import('@/editor/panel').then((m) => ({ default: m.EditorPanel })));

function App() {
    return (
        <div id="app" className="relative w-full h-full overflow-hidden">
            <PhaserGame />
            <GameHUDLayer />
            <Suspense fallback={null}>
                <EditorPanel />
            </Suspense>
            <PixelCrosshair />
            <RotateOverlay />
            <TouchControls />
        </div>
    );
}

export default App;
