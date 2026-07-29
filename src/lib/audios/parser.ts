/**
 * src/lib/audios/parser.ts
 * --------------------------------------------------------------------------
 * Pure sync parsing + validation. No I/O.
 *
 * Validation is delegated to `./schema.ts` (Zod). Error messages keep
 * a `Sound ${id}` prefix so callers can grep / surface a user-friendly
 * message; Zod's structured issues are joined with `;` for diagnostics.
 *
 * `id` for sound specs is required from the YAML itself — the loader
 * does NOT inject it from the filename as the drops/monsters loaders do.
 */

import { load as parseYaml } from 'js-yaml';
import type { ZodError } from 'zod';

import type { AudioIndex, SoundSpec } from './types';
import { AudioIndexSchema, SoundSpecSchema } from './schema';

function pathOf(issue: { path: ReadonlyArray<PropertyKey> }): string {
    return issue.path.map(String).join('.');
}

function rethrow(zerr: ZodError, id: string): never {
    const summary = zerr.issues
        .map((i) => `${pathOf(i)}: ${i.message}`)
        .join('; ');
    throw new Error(`Sound ${id}: ${summary}`);
}

export function parseAudioYaml(text: string): SoundSpec {
    const raw = parseYaml(text);
    if (raw === null || typeof raw !== 'object') {
        throw new Error('Sound: empty or non-object YAML');
    }
    const id = (raw as { id?: string }).id ?? 'unknown';
    const result = SoundSpecSchema.safeParse(raw);
    if (!result.success) throw rethrow(result.error, id);
    return result.data;
}

export function parseAudioIndex(text: string): AudioIndex {
    const raw = parseYaml(text);
    if (raw === null || typeof raw !== 'object') {
        throw new Error('Audio index: empty or non-object YAML');
    }
    const result = AudioIndexSchema.safeParse(raw);
    if (!result.success) {
        const summary = result.error.issues
            .map((i) => `${pathOf(i)}: ${i.message}`)
            .join('; ');
        throw new Error(`Audio index: ${summary}`);
    }
    return result.data;
}
