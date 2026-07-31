/**
 * src/lib/drops/schema.ts
 * --------------------------------------------------------------------------
 * Zod schema for the drops module — single source of truth for both runtime
 * validation (used by parser.ts on YAML load + by editor save-time check)
 * AND the TypeScript types in `./types.ts` (derived via `z.infer`).
 *
 * Discriminated union on `effect.type` mirrors the original hand-rolled
 * branch logic; `.strict()` rejects extra keys so a typo in the YAML is
 * caught instead of silently swallowed.
 *
 * Zod 4 note: `z.number()` already rejects NaN and Infinity, so there's
 * no need for the (now-deprecated) `finite()` / `safe()` helpers.
 */

import { z } from 'zod';

// ─── Visual ───────────────────────────────────────────────────────────────

export const DropVisualSchema = z
    .object({
        size: z.number().gt(0),
        tint: z.number(),
    })
    .strict();

// ─── Effect (discriminated union) ─────────────────────────────────────────

const InstantEffectSchema = z
    .object({
        type: z.literal('instant'),
        hp: z.number().gte(0).default(0),
        sp: z.number().gte(0).default(0),
    })
    .strict()
    .refine((v) => v.hp > 0 || v.sp > 0, {
        message: 'instant effect needs hp > 0 or sp > 0',
    });

const RefillAmmoEffectSchema = z
    .object({
        type: z.literal('refill-ammo'),
        ammoFraction: z.number().gt(0).lte(1),
    })
    .strict();

const WeaponEffectSchema = z
    .object({
        type: z.literal('weapon'),
        weaponId: z.string().min(1),
    })
    .strict();

export const DropEffectSchema = z.discriminatedUnion('type', [
    InstantEffectSchema,
    RefillAmmoEffectSchema,
    WeaponEffectSchema,
]);

// ─── DropSpec ─────────────────────────────────────────────────────────────
//
// `id` is set by the loader from the filename; the schema accepts it as
// an optional field so test fixtures (which build the object directly)
// can include it. The loader still overwrites it with the canonical id.

import { SpriteSchema, AnimSpecSchema } from '@/lib/monsters/schema';

export const DropSpecSchema = z
    .object({
        id: z.string().min(1).optional(),
        name: z.string().min(1),
        kind: z.enum(['static', 'monster']),
        visual: DropVisualSchema,
        effect: DropEffectSchema,
        /** SFX id to play on pickup. Falls back to a generic pickup tone
         *  in the controller when omitted. */
        sfx: z.string().min(1).optional(),
        /** Per-drop throttle on the pickup SFX so simultaneous kills
         *  dropping the same item don't stack overlapping pickup tones.
         *  Keyed per-drop-id. */
        throttleMs: z.number().gt(0).optional(),
        sprite: SpriteSchema.optional(),
        anims: z.record(z.string(), AnimSpecSchema).optional(),
        prompt: z.string().optional(),
    })
    .strict();

// ─── Index ────────────────────────────────────────────────────────────────

export const DropIndexSchema = z
    .object({
        drops: z.array(z.string().min(1)),
    })
    .strict();