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

export const WeaponVisualSchema = z
    .object({
        texture: z.string().optional(),
        scale: z.number().gt(0).default(0.16),
        orbitRadius: z.number().default(16),
        anchor: z.tuple([z.number(), z.number()]).default([0.2, 0.5]),
        muzzleOffset: z.number().default(400),
        recoilDistance: z.number().default(6),
        recoilDuration: z.number().default(80),
        swingAngle: z.number().default(120),
        rotationOffset: z.number().default(0),
    })
    .strict();

export const WeaponPairedBulletSchema = z
    .object({
        texture: z.string().optional(),
        type: z.enum(['projectile', 'beam', 'melee']).default('projectile'),
        speed: z.number().gt(0).optional(),
        scale: z.number().gt(0).default(1),
        color: z.string().optional(),
        beamWidth: z.number().gt(0).optional(),
        rotationOffset: z.number().default(0),
    })
    .strict();

export const WeaponSpecSchema = z
    .object({
        id: z.string().min(1).optional(),
        name: z.string().min(1),
        damage: z.number().gt(0),
        cooldownMs: z.number().gte(0),
        range: z.number().gt(0),
        // Visual & Procedural Controls
        visual: WeaponVisualSchema.optional(),
        // Paired 1-to-1 Bullet / Attack Spec
        bullet: WeaponPairedBulletSchema.optional(),
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