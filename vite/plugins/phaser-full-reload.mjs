/**
 * vite/plugins/phaser-full-reload.mjs
 * --------------------------------------------------------------------------
 * Force a full page reload whenever a file under src/game/ changes.
 *
 * Phaser games don't have a useful HMR boundary — the scene and its
 * Matter bodies are constructed once at scene.start() and the running
 * instance never picks up source edits. Without this plugin, edits to
 * load-scene.ts / load-wall.ts / load-character.ts look like nothing
 * happens until F5.
 *
 * Anything else (React components, panel CSS, etc.) keeps its normal
 * React Fast Refresh behavior.
 */

export function phaserFullReloadPlugin() {
    return {
        name: 'phaser-full-reload',
        handleHotUpdate({ file, server }) {
            if (file.includes('/src/game/')) {
                server.ws.send({ type: 'full-reload' });
                return []; // empty modules list — Vite doesn't bother HMR-ing anything
            }
        },
    };
}