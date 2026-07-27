import { PhaserGame } from '@/PhaserGame';

/**
 * Top-level React component. Mounts the Phaser game inside
 * `#game-container`; the Phaser layer owns all in-game UI for now.
 * External UI (debug panel, settings, …) will live alongside this.
 */
function App() {
    return (
        <div id="app">
            <PhaserGame />
        </div>
    );
}

export default App;