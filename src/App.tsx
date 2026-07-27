import { PhaserGame } from '@/PhaserGame';
import { EditorPanel } from '@/editor/panel';

/**
 * Top-level React component. Mounts the Phaser game inside
 * `#game-container`; the editor panel overlays on top, toggled by F2.
 */
function App() {
    return (
        <div id="app">
            <PhaserGame />
            <EditorPanel />
        </div>
    );
}

export default App;