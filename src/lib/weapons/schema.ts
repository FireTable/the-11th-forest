/**
 * src/lib/weapons/schema.ts
 * --------------------------------------------------------------------------
 * Zod schema for the weapons module. A weapon is one of two kinds:
 *   - ranged: has a `projectile` block (speed + visual)
 *   - melee:  has hitWidth + hitHeight instead
 *
 * Modelled as a single schema with both paths optional; a `superRefine`
 * enforces exactly one of the two paths is present (mirrors the
 * original hand-rolled check). Going through `z.union` doesn't work in
 * Zod 4 because a "neither" or "both" input makes every branch fail
 * before `superRefine` gets a chance, surfacing only a generic
 * "Invalid input" error to the caller.
 *
 * Single source of truth — `./types.ts` derives types via `z.infer`.
 */

import { z } from 'zod';

const ProjectileVisualSchema = z
    .object({
        radius: z.number().gt(0),
        width: z.number().gt(0),
        height: z.number().gt(0),
        color: z.number(),
    })
    .strict();

const ProjectileSchema = z
    .object({
        speed: z.number().gt(0),
        visual: ProjectileVisualSchema,
    })
    .strict();

/** SFX ids played for this weapon's events. All fields optional —
 *  controller falls back to global 'player-shoot' / 'reload-*' / etc.
 *  when missing. */
export const WeaponSfxSchema = z
    .object({
        shoot: z.string().min(1).optional(),
        dryFire: z.string().min(1).optional(),
        bulletWall: z.string().min(1).optional(),
        reloadStart: z.string().min(1).optional(),
        reloadFinish: z.string().min(1).optional(),
    })
    .strict();

export const WeaponSpecSchema = z
    .object({
        id: z.string().min(1).optional(),
        name: z.string().min(1),
        damage: z.number().gt(0),
        cooldownMs: z.number().gte(0),
        range: z.number().gt(0),
        // Ranged-only
        projectile: ProjectileSchema.optional(),
        clipSize: z.number().gt(0).optional(),
        reloadTimeMs: z.number().gt(0).optional(),
        bulletsPerShot: z.number().gt(0).optional(),
        // Melee-only
        hitWidth: z.number().gt(0).optional(),
        hitHeight: z.number().gt(0).optional(),
        sfx: WeaponSfxSchema.optional(),
    })
    .strict()
    .superRefine((val, ctx) => {
        const hasProjectile = val.projectile !== undefined;
        const hasMelee = val.hitWidth !== undefined || val.hitHeight !== undefined;
        if (hasProjectile === hasMelee) {
            ctx.addIssue({
                code: 'custom',
                message:
                    'must be either ranged (projectile) or melee (hitWidth + hitHeight), not both or neither',
            });
        }
        if (hasMelee) {
            if (val.hitWidth === undefined) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['hitWidth'],
                    message: 'melee weapon needs hitWidth',
                });
            }
            if (val.hitHeight === undefined) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['hitHeight'],
                    message: 'melee weapon needs hitHeight',
                });
            }
        }
    });

export const WeaponIndexSchema = z
    .object({
        weapons: z.array(z.string().min(1)),
    })
    .strict();