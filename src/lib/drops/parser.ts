/**
 * src/lib/drops/parser.ts
 * --------------------------------------------------------------------------
 * Pure sync parsing + validation. No I/O.
 *
 * Validation is delegated to `./schema.ts` (Zod). Error messages keep
 * the original `Drop ${id}: ...` prefix so callers can grep / surface
 * a user-friendly message; Zod's structured issues are appended for
 * diagnostics.
 */

import { load as parseYaml } from 'js-yaml';
import type { ZodError } from 'zod';

import type { DropIndex, DropSpec } from './types';
import { DropIndexSchema, DropSpecSchema } from './schema';

/** Format a Zod issue path (e.g. `effect.hp`) into a dotted segment. */
function pathOf(issue: { path: ReadonlyArray<PropertyKey> }): string {
    return issue.path.map(String).join('.');
}

/** Re-throw a ZodError as a plain Error prefixed with `Drop ${id}:`. */
function rethrow(zerr: ZodError, id: string): never {
    const summary = zerr.issues.map((i) => `${pathOf(i)}: ${i.message}`).join('; ');
    throw new Error(`Drop ${id}: ${summary}`);
}

export function parseDropYaml(text: string, id: string): DropSpec {
    const raw = parseYaml(text);
    if (raw === null || typeof raw !== 'object') {
        throw new Error(`Drop ${id}: empty or non-object YAML`);
    }
    // Inject `id` so the schema treats it as an extra allowed field — but
    // since DropSpecSchema is `.strict()`, we instead validate without id
    // and merge it back in afterwards.
    const result = DropSpecSchema.safeParse(raw);
    if (!result.success) throw rethrow(result.error, id);
    // Loader's id (from filename) wins over whatever the YAML had.
    return { ...result.data, id };
}

export function parseDropIndex(text: string): DropIndex {
    const raw = parseYaml(text);
    if (raw === null || typeof raw !== 'object') {
        throw new Error('Drop index: empty or non-object YAML');
    }
    const result = DropIndexSchema.safeParse(raw);
    if (!result.success) {
        const summary = result.error.issues.map((i) => `${pathOf(i)}: ${i.message}`).join('; ');
        throw new Error(`Drop index: ${summary}`);
    }
    return result.data;
}
