/**
 * scripts/validate-levels.ts
 * --------------------------------------------------------------------------
 * CI / pre-commit sanity check for public/data/levels/.
 *
 *   - Each id in index.yaml must have a matching data/levels/<id>.yaml file
 *   - Each file's imageSize must equal its prompts/scenes/<id>.yaml imageSize
 *
 * Orphan files (data/levels/*.yaml not listed in index.yaml) are ALLOWED —
 * treat them as drafts. The check is one-way.
 *
 * Run:
 *   pnpm tsx scripts/validate-levels.ts
 */

import { config as loadEnv } from 'dotenv';
import { readFileSync } from 'node:fs';

import { fetchLevel, fetchLevelIndex } from '@/lib/levels';
import { formatImageSize } from '@/lib/levels/types';

loadEnv(); // .env
loadEnv({ path: '.env.local', override: true }); // .env.local

async function main(): Promise<void> {
    const { load: parseYaml } = await import('js-yaml');

    const index = await fetchLevelIndex();
    if (index.levels.length === 0) {
        console.error('Level index is empty — add an entry to public/data/levels/index.yaml.');
        process.exit(1);
    }

    let failed = 0;
    for (const id of index.levels) {
        try {
            const level = await fetchLevel(id);

            // Cross-file invariant: level.imageSize must equal prompt's imageSize.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const promptYaml = parseYaml(readFileSync(level.promptFile, 'utf8')) as any;
            if (typeof promptYaml?.imageSize !== 'string') {
                throw new Error(`${level.promptFile} has no imageSize`);
            }
            if (promptYaml.imageSize !== formatImageSize(level.imageSize)) {
                throw new Error(
                    `imageSize mismatch — level ${formatImageSize(level.imageSize)} vs prompt ${promptYaml.imageSize}`,
                );
            }

            console.log(`  ✓ ${id}  (${level.airWalls.length} walls)`);
        } catch (err) {
            console.error(`  ✗ ${id}:`, err instanceof Error ? err.message : err);
            failed++;
        }
    }

    if (failed > 0) {
        console.error(`\n${failed} level(s) failed validation.`);
        process.exit(1);
    }
    console.log(`\nAll ${index.levels.length} level(s) valid.`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});