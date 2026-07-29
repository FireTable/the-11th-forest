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

export const MonsterSpecSchema = z
    .object({
        id: z.string().min(1).optional(),
        name: z.string().min(1),
        hp: z.number().gte(0),
        moveSpeed: z.number().gt(0),
        body: BodySchema,
        weaponId: z.string().min(1),
        drops: z.array(DropRefSchema).default([]),
    })
    .strict();

export const MonsterIndexSchema = z
    .object({
        monsters: z.array(z.string().min(1)),
    })
    .strict();