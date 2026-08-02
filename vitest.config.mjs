import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Vitest config — tests live under `tests/` and mirror the `src/` tree
// (e.g. `src/lib/events/bus.ts` → `tests/lib/events/bus.test.ts`).
// Mirror the `@/` alias from vite/config.*.mjs so test imports resolve.
export default defineConfig({
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    test: {
        include: ['tests/**/*.{test,spec}.{ts,tsx}'],
        environment: 'node',
        globals: false,
    },
});
