import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { editorApiPlugin } from './plugins/editor-api.mjs';
import { phaserFullReloadPlugin } from './plugins/phaser-full-reload.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vitejs.dev/config/
export default defineConfig({
    base: './',
    plugins: [react(), tailwindcss(), editorApiPlugin(), phaserFullReloadPlugin()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, '../src'),
        },
    },
    server: {
        port: 8080,
    },
});
