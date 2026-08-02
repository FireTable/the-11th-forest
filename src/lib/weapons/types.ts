/**
 * src/lib/weapons/types.ts
 * --------------------------------------------------------------------------
 * Runtime weapon data. One YAML per weapon, no `id` field — filename is the id.
 *
 * A weapon is the unified attack primitive used by both player and
 * monsters. The kind is inferred from which fields are present:
 *
 *   Ranged (projectile present, hitWidth absent):
 *     - Player fires on click; cooldown between shots = cooldownMs
 *     - Monster fires when player in range; cooldown = cooldownMs
 *     - clipSize / reloadTimeMs / bulletsPerShot are player-only (magazine)
 *
 *   Melee (hitWidth + hitHeight present, projectile absent):
 *     - Currently only monsters; click-to-melee for player is future
 *     - range = hit radius for contact damage
 *
 * Shared fields:
 *   damage      — per-hit HP dealt
 *   cooldownMs  — time between attacks
 *   range       — effective combat range (AI decision + bullet distance)
 *
 * Types are derived from `./schema.ts` via `z.infer` — single source
 * of truth shared with runtime validation.
 */

import type { z } from 'zod';

import type {
    WeaponIndexSchema,
    WeaponPairedBulletSchema,
    WeaponSpecSchema,
    WeaponVisualSchema,
} from './schema';

export type ProjectileVisual = Extract<
    z.infer<typeof WeaponSpecSchema>,
    { projectile: unknown }
>['projectile'];

export type WeaponVisualSpec = z.infer<typeof WeaponVisualSchema>;
export type WeaponPairedBulletSpec = z.infer<typeof WeaponPairedBulletSchema>;
export type WeaponSpec = z.infer<typeof WeaponSpecSchema>;

export type WeaponIndex = z.infer<typeof WeaponIndexSchema>;
