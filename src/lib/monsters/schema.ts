/**
 * src/lib/monsters/schema.ts
 * --------------------------------------------------------------------------
 * Zod schema for the monsters module.
 *
 * `body` is optional with defaults (14x14) so existing monster YAMLs
 * without a body block keep working.
 *
 * Single source of truth — `./types.ts` derives types via `z.infer`.
 */

import { z } from 'zod';

export const DropRefSchema = z
    .object({
        dropId: z.string().min(1),
        chance: z.number().gte(0).lte(1),
    })
    .strict();

const BodySchema = z
    .object({
        halfW: z.number().gt(0).default(14),
        halfH: z.number().gt(0).default(14),
    })
    .strict()
    .default({ halfW: 14, halfH: 14 });

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

export const SpriteSchema = z
    .object({
        texture: z.string().min(1),
        grid: SpriteGridSchema.optional(),
        scale: z.number().gt(0).optional(),
        offset: SpriteOffsetSchema,
        script: z
            .object({
                downsample: z.number().optional(),
                colors: z.number().optional(),
                pad: z.number().optional(),
            })
            .optional(),
    })
    .strict();

export const AnimSpecSchema = z
    .object({
        frames: z.tuple([z.number(), z.number()]),
        frameRate: z.number().gt(0),
        repeat: z.number().optional(),
    })
    .strict()
    .refine((v) => v.frames[1] >= v.frames[0], {
        message: 'frames[1] must be >= frames[0]',
    });

const AnimsSchema = z.record(z.string(), AnimSpecSchema);

export const MonsterSpecSchema = z
    .object({
        id: z.string().min(1).optional(),
        name: z.string().min(1),
        imageSize: z.string().regex(/^\d+x\d+$/).optional(),
        prompt: z.string().optional(),
        hp: z.number().gte(0),
        moveSpeed: z.number().gt(0),
        body: BodySchema,
        weaponId: z.string().min(1),
        drops: z.array(DropRefSchema).default([]),
        sprite: SpriteSchema.optional(),
        anims: AnimsSchema.optional(),
    })
    .strict();

export const MonsterIndexSchema = z
    .object({
        monsters: z.array(z.string().min(1)),
    })
    .strict();