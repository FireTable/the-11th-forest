/**
 * src/lib/levels/parser.ts
 * --------------------------------------------------------------------------
 * Pure sync parsing + validation. No I/O. Caller supplies the YAML text.
 *
 * Lives apart from loader.ts so tests can hit parsing logic without
 * touching fetch or fs.
 *
 * Validation is delegated to `./schema.ts` (Zod). The schema handles
 * two legacy migrations:
 *   - air wall `x/y/width/height` → 4-vertex `points` polygon
 *   - spawn `at: [x, y]` → flat `x`, `y`
 *
 * Errors are re-thrown as plain Errors prefixed `Level ${id}:` to
 * preserve the existing caller-facing format.
 */

import { load as parseYaml } from 'js-yaml';
import type { ZodError } from 'zod';

import type { Level, LevelIndex } from './types';
import { LevelIndexSchema, LevelSchema } from './schema';

function pathOf(issue: { path: ReadonlyArray<PropertyKey> }): string {
    return issue.path.map(String).join('.');
}

function rethrow(zerr: ZodError, id: string): never {
    const summary = zerr.issues
        .map((i) => `${pathOf(i)}: ${i.message}`)
        .join('; ');
    throw new Error(`Level ${id}: ${summary}`);
}

export function parseLevelYaml(text: string, id: string): Level {
    const raw = parseYaml(text);
    if (raw === null || typeof raw !== 'object') {
        throw new Error(`Level ${id}: empty or non-object YAML`);
    }
    const result = LevelSchema.safeParse(raw);
    if (!result.success) throw rethrow(result.error, id);
    return result.data;
}

export function parseLevelIndex(text: string): LevelIndex {
    const raw = parseYaml(text);
    if (raw === null || typeof raw !== 'object') {
        throw new Error('Level index: empty or non-object YAML');
    }
    const result = LevelIndexSchema.safeParse(raw);
    if (!result.success) {
        const summary = result.error.issues
            .map((i) => `${pathOf(i)}: ${i.message}`)
            .join('; ');
        throw new Error(`Level index: ${summary}`);
    }
    return result.data;
}