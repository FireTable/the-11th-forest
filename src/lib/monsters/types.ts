/**
 * src/lib/monsters/types.ts
 * --------------------------------------------------------------------------
 * Monster runtime data. One YAML per monster type, no `id` field.
 *
 * Monsters are now just bodies + AI state — their attack details live
 * in a referenced `weapons/{weaponId}.yaml` so the attack system
 * stays in the `weapons/` module.
 *
 *   - kind / damage / range / cooldown are derived from the weapon
 *   - drops is a weighted list rolled on death (chance 0..1)
 *
 * Types are derived from `./schema.ts` via `z.infer` — single source
 * of truth shared with runtime validation.
 */

import type { z } from 'zod';

import type {
    DropRefSchema,
    MonsterIndexSchema,
    MonsterSpecSchema,
} from './schema';

export type DropRef = z.infer<typeof DropRefSchema>;

export type MonsterSpec = z.infer<typeof MonsterSpecSchema>;

/** Ordered manifest of all monster types. */
export type MonsterIndex = z.infer<typeof MonsterIndexSchema>;