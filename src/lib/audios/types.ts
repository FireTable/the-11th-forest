/**
 * src/lib/audios/types.ts
 * --------------------------------------------------------------------------
 * Audio spec data. Two kinds, both with a required `id` (the canonical
 * EventBus trigger name):
 *
 *   kind = 'sfx'    — one-shot or ambient loop, polyphonic
 *   kind = 'music'  — continuous background music, single-track at a time
 *
 * Types are derived from `./schema.ts` via `z.infer` — single source of
 * truth shared with runtime validation. Do NOT hand-write types here.
 */

import type { z } from 'zod';

import type {
    AudioIndexSchema,
    MusicSpecSchema,
    SfxSpecSchema,
    SoundSpecSchema,
} from './schema';

export type SfxSpec = z.infer<typeof SfxSpecSchema>;

export type MusicSpec = z.infer<typeof MusicSpecSchema>;

export type SoundSpec = z.infer<typeof SoundSpecSchema>;

export type AudioIndex = z.infer<typeof AudioIndexSchema>;
