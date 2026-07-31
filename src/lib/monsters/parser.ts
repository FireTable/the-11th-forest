/**
 * src/lib/monsters/parser.ts
 * --------------------------------------------------------------------------
 * Pure sync parsing + validation. No I/O.
 *
 * Monster shape:
 *
 *   name: Drone
 *   hp: 30
 *   moveSpeed: 4
 *   body: { halfW: 14, halfH: 14 }   # optional, defaults to 14x14
 *   weaponId: drone-claws            # references weapons/{weaponId}.yaml
 *   drops:
 *     - dropId: hp-shard
 *       chance: 0.4
 *
 * Validation is delegated to `./schema.ts` (Zod). Errors are re-thrown
 * as plain Errors prefixed `Monster ${id}:` to preserve the existing
 * caller-facing format.
 */

import { load as parseYaml } from 'js-yaml';
import type { ZodError } from 'zod';

import type { MonsterIndex, MonsterSpec } from './types';
import { MonsterIndexSchema, MonsterSpecSchema } from './schema';

function pathOf(issue: { path: ReadonlyArray<PropertyKey> }): string {
    return issue.path.map(String).join('.');
}

function rethrow(zerr: ZodError, id: string): never {
    const summary = zerr.issues
        .map((i) => `${pathOf(i)}: ${i.message}`)
        .join('; ');
    throw new Error(`Monster ${id}: ${summary}`);
}

export function parseMonsterYaml(text: string, id: string): MonsterSpec {
    const raw = parseYaml(text);
    if (raw === null || typeof raw !== 'object') {
        throw new Error(`Monster ${id}: empty or non-object YAML`);
    }
    const result = MonsterSpecSchema.safeParse(raw);
    if (!result.success) throw rethrow(result.error, id);
    // Loader's id (from filename) wins over whatever the YAML had.
    return { ...result.data, id } as MonsterSpec;
}

export function parseMonsterIndex(text: string): MonsterIndex {
    const raw = parseYaml(text);
    if (raw === null || typeof raw !== 'object') {
        throw new Error('Monster index: empty or non-object YAML');
    }
    const result = MonsterIndexSchema.safeParse(raw);
    if (!result.success) {
        const summary = result.error.issues
            .map((i) => `${pathOf(i)}: ${i.message}`)
            .join('; ');
        throw new Error(`Monster index: ${summary}`);
    }
    return result.data;
}