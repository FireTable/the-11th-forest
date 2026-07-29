/**
 * src/lib/weapons/parser.ts
 * --------------------------------------------------------------------------
 * Pure sync parsing + validation. No I/O. Caller supplies the YAML text.
 *
 * Validation is delegated to `./schema.ts` (Zod). Errors are re-thrown
 * as plain Errors prefixed `Weapon ${id}:` to preserve the existing
 * caller-facing format.
 */

import { load as parseYaml } from 'js-yaml';
import type { ZodError } from 'zod';

import type { WeaponIndex, WeaponSpec } from './types';
import { WeaponIndexSchema, WeaponSpecSchema } from './schema';

function pathOf(issue: { path: ReadonlyArray<PropertyKey> }): string {
    return issue.path.map(String).join('.');
}

function rethrow(zerr: ZodError, id: string): never {
    const summary = zerr.issues
        .map((i) => `${pathOf(i)}: ${i.message}`)
        .join('; ');
    throw new Error(`Weapon ${id}: ${summary}`);
}

export function parseWeaponYaml(text: string, id: string): WeaponSpec {
    const raw = parseYaml(text);
    if (raw === null || typeof raw !== 'object') {
        throw new Error(`Weapon ${id}: empty or non-object YAML`);
    }
    const result = WeaponSpecSchema.safeParse(raw);
    if (!result.success) throw rethrow(result.error, id);
    // Loader's id (from filename) wins over whatever the YAML had.
    return { ...result.data, id } as WeaponSpec;
}

export function parseWeaponIndex(text: string): WeaponIndex {
    const raw = parseYaml(text);
    if (raw === null || typeof raw !== 'object') {
        throw new Error('Weapon index: empty or non-object YAML');
    }
    const result = WeaponIndexSchema.safeParse(raw);
    if (!result.success) {
        const summary = result.error.issues
            .map((i) => `${pathOf(i)}: ${i.message}`)
            .join('; ');
        throw new Error(`Weapon index: ${summary}`);
    }
    return result.data;
}