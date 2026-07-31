/**
 * src/lib/characters/schema.ts
 * --------------------------------------------------------------------------
 * Zod schema for the characters module.
 *
 * `sprite` and `anims` are optional — a character may run with a debug
 * rectangle instead of a sprite sheet. `body`, `dodge`, `hotbar` are
 * required. `frames` is a 2-tuple [start, end] with end >= start.
 *
 * Single source of truth — `./types.ts` derives types via `z.infer`.
 */

import { z } from 'zod';

const BodySchema = z
    .object({
        halfW: z.number().gt(0),
        halfH: z.number().gt(0),
    })
    .strict();

const DodgeSchema = z
    .object({
        spCost: z.number().gte(0),
        speed: z.number().gt(0),
        durationMs: z.number().gt(0),
        cooldownMs: z.number().gt(0),
    })
    .strict();

const SpriteGridSchema = z
    .object({
        rows: z.number().gt(0),
        cols: z.number().gt(0),
    })
    .strict();

const SpriteOffsetSchema = z
    .object({
        left: z.number().optional(),
        bottom: z.number().optional(),
        x: z.number().optional(),
        y: z.number().optional(),
    })
    .strict()
    .optional();

const SpriteSchema = z
    .object({
        texture: z.string().min(1),
        grid: SpriteGridSchema,
        scale: z.number().gt(0),
        offset: SpriteOffsetSchema,
        script: z
            .object({
                downsample: z.number().int().gt(0).optional(),
                colors: z.number().int().gt(0).optional(),
                pad: z.number().int().gte(0).optional(),
            })
            .strict()
            .optional(),
    })
    .strict();

const AnimSpecSchema = z
    .object({
        frames: z.tuple([z.number().int().gte(0), z.number().int().gte(0)]),
        frameRate: z.number().gt(0),
        repeat: z.number().int(),
    })
    .strict()
    .refine((v) => v.frames[1] >= v.frames[0], {
        message: 'frames[1] must be >= frames[0]',
    });

const AnimsSchema = z.record(z.string(), AnimSpecSchema);

/** Per-character audio identity. SFX ids are required when the
 *  corresponding event applies; tuning knobs (throttle / threshold /
 *  pulse) are optional and fall back to controller defaults when
 *  omitted. */
export const CharacterSfxSchema = z
    .object({
        dodge: z.string().min(1).optional(),
        hurt: z.string().min(1).optional(),
        /** SFX id for the male variant of `hurt`. Picked when
         *  CharacterSpec.gender === 'male' and this field is set. */
        hurtMale: z.string().min(1).optional(),
        /** SFX id for the female variant of `hurt`. Picked when
         *  CharacterSpec.gender === 'female' and this field is set. */
        hurtFemale: z.string().min(1).optional(),
        footstep: z.string().min(1).optional(),
        footstepThrottleMs: z.number().gt(0).optional(),
        lowHpHeartbeat: z.string().min(1).optional(),
        lowHpThreshold: z.number().gt(0).lte(1).optional(),
        lowHpPulseMs: z.number().gt(0).optional(),
        /** Per-character throttle on the `hurt` SFX variants so
         *  repeated damage events don't stack overlapping scream
         *  instances. Keyed per-character. */
        throttleMs: z.number().gt(0).optional(),
    })
    .strict();

export const CharacterSpecSchema = z
    .object({
        // YAML `id` is required and must match the filename-derived id;
        // the parser enforces that invariant after safeParse. Required
        // (not optional) so downstream code can rely on spec.id being a
        // string in the output type.
        id: z.string().min(1),
        name: z.string().min(1),
        // Self-contained doc fields — accepted on input for YAML
        // readability but not surfaced on the runtime spec.
        imageSize: z.string().regex(/^\d+x\d+$/).optional(),
        prompt: z.string().optional(),
        hp: z.number().gte(0),
        sp: z.number().gte(0),
        moveSpeed: z.number().gt(0),
        spRegenMs: z.number().gt(0),
        /** Voice identity for the `hurt` SFX. When set, CharacterController
         *  picks `sfx.hurtFemale` / `sfx.hurtMale`; otherwise falls back to
         *  the gender-neutral `sfx.hurt`. */
        gender: z.enum(['male', 'female']).optional(),
        body: BodySchema,
        dodge: DodgeSchema,
        hotbar: z.array(z.string().min(1)).min(1),
        /** Per-character audio identity — SFX ids + tuning knobs for
         *  dodge / hurt / footstep / low-HP heartbeat. All optional. */
        sfx: CharacterSfxSchema.optional(),
        sprite: SpriteSchema.optional(),
        anims: AnimsSchema.optional(),
    })
    .strict();

export const CharacterIndexSchema = z
    .object({
        characters: z.array(z.string().min(1)),
    })
    .strict();