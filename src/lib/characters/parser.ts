/**
 * src/lib/characters/parser.ts
 * --------------------------------------------------------------------------
 * Pure sync parsing + validation. No I/O.
 *
 * Validation is delegated to `./schema.ts` (Zod). Errors are re-thrown
 * as plain Errors prefixed `Character ${id}:` to preserve the existing
 * caller-facing format.
 *
 * The YAML `id` field is validated against the filename-derived id
 * (mismatch throws). Other than that, the parser is a thin wrapper
 * around `schema.safeParse`.
 */

import { load as parseYaml } from 'js-yaml';
import type { ZodError } from 'zod';

import type { CharacterIndex, CharacterSpec } from './types';
import { CharacterIndexSchema, CharacterSpecSchema } from './schema';

function pathOf(issue: { path: ReadonlyArray<PropertyKey> }): string {
    return issue.path.map(String).join('.');
}

function rethrow(zerr: ZodError, id: string): never {
    const summary = zerr.issues.map((i) => `${pathOf(i)}: ${i.message}`).join('; ');
    throw new Error(`Character ${id}: ${summary}`);
}

export function parseCharacterYaml(text: string, id: string): CharacterSpec {
    const raw = parseYaml(text);
    if (raw === null || typeof raw !== 'object') {
        throw new Error(`Character ${id}: empty or non-object YAML`);
    }
    const result = CharacterSpecSchema.safeParse(raw);
    if (!result.success) throw rethrow(result.error, id);
    if (result.data.id !== undefined && result.data.id !== id) {
        throw new Error(
            `Character ${id}: yaml id "${result.data.id}" doesn't match filename — keep them in sync`,
        );
    }
    // Loader's id (from filename) wins over whatever the YAML had.
    return { ...result.data, id };
}

export function parseCharacterIndex(text: string): CharacterIndex {
    const raw = parseYaml(text);
    if (raw === null || typeof raw !== 'object') {
        throw new Error('Character index: empty or non-object YAML');
    }
    const result = CharacterIndexSchema.safeParse(raw);
    if (!result.success) {
        const summary = result.error.issues.map((i) => `${pathOf(i)}: ${i.message}`).join('; ');
        throw new Error(`Character index: ${summary}`);
    }
    return result.data;
}
