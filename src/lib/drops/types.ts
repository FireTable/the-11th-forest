/**
 * src/lib/drops/types.ts
 * --------------------------------------------------------------------------
 * Drop / pickup data. One YAML per drop type, no `id` field.
 *
 *   type = 'instant'     — apply effect immediately: { hp?: number, sp?: number }
 *   type = 'refill-ammo' — add N bullets to current weapon's clip: { ammoFraction: 0..1 }
 *   type = 'weapon'      — switch active weapon: { weaponId: string }
 *
 *   kind = 'static'      — placed on the map from level.dropSpawns
 *   kind = 'monster'     — dropped by a monster on death
 *
 * Types are derived from `./schema.ts` via `z.infer` — single source of
 * truth shared with runtime validation. Do NOT hand-write types here.
 */

import type { z } from 'zod';

import type { DropEffectSchema, DropIndexSchema, DropSpecSchema, DropVisualSchema } from './schema';

export type DropType = 'instant' | 'refill-ammo' | 'weapon';

export type DropKind = 'static' | 'monster';

export type DropVisual = z.infer<typeof DropVisualSchema>;

export type DropEffect = z.infer<typeof DropEffectSchema>;

export type DropSpec = z.infer<typeof DropSpecSchema>;

export type DropIndex = z.infer<typeof DropIndexSchema>;
