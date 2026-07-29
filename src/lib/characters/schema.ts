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

export const CharacterSpecSchema = z
    .object({
        // YAML `id` is required and must match the filename-derived id;
        // the parser enforces that invariant after safeParse. Required
        // (not optional) so downstream code can rely on spec.id being a
        // string in the output type.
        id: z.string().min(1),
        name: z.string().min(1),
        hp: z.number().gte(0),
        sp: z.number().gte(0),
        moveSpeed: z.number().gt(0),
        spRegenMs: z.number().gt(0),
        body: BodySchema,
        dodge: DodgeSchema,
        hotbar: z.array(z.string().min(1)).min(1),
        sprite: SpriteSchema.optional(),
        anims: AnimsSchema.optional(),
    })
    .strict();

export const CharacterIndexSchema = z
    .object({
        characters: z.array(z.string().min(1)),
    })
    .strict();