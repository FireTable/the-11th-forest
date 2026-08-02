/**
 * src/lib/audios/schema.ts
 * --------------------------------------------------------------------------
 * Zod schemas for the audios module — single source of truth for both
 * runtime validation (used by parser.ts on YAML load) and the TypeScript
 * types in `./types.ts` (derived via `z.infer`).
 *
 * Two spec kinds, discriminated on `kind`:
 *   - sfx    — one-shot (or ambient loop) triggered by an EventBus event.
 *   - music  — continuous background music, single-track at a time.
 *
 * ID is required for both kinds (not injected from filename) because the
 * event name is derived from the id, e.g. `sfx:pickup-hp`. Unlike sprites
 * (which live in a sheet and need filename injection), every audio file
 * is a single resource whose id is one of the canonical play triggers.
 *
 * `prompt` is an optional, free-form string for the AI generation
 * pipeline (MiniMax music / sound generation). Off the runtime path.
 */

import { z } from 'zod';

// ─── SFX ─────────────────────────────────────────────────────────────────

export const SfxSpecSchema = z
    .object({
        kind: z.literal('sfx'),
        id: z.string().min(1),
        name: z.string().min(1),
        source: z.string().min(1),
        volume: z.number().gte(0).lte(1).default(1),
        rate: z.number().gt(0).default(1),
        loop: z.boolean().default(false),
        prompt: z.string().optional(),
    })
    .strict();

// ─── Music ───────────────────────────────────────────────────────────────

export const MusicSpecSchema = z
    .object({
        kind: z.literal('music'),
        id: z.string().min(1),
        name: z.string().min(1),
        source: z.string().min(1),
        volume: z.number().gte(0).lte(1).default(0.5),
        fadeIn: z.number().gte(0).default(0),
        fadeOut: z.number().gte(0).default(0),
        prompt: z.string().optional(),
    })
    .strict();

// ─── Union ───────────────────────────────────────────────────────────────

export const SoundSpecSchema = z.discriminatedUnion('kind', [SfxSpecSchema, MusicSpecSchema]);

// ─── Index ──────────────────────────────────────────────────────────────

export const AudioIndexSchema = z
    .object({
        sfx: z.array(z.string().min(1)),
        music: z.array(z.string().min(1)),
    })
    .strict();
