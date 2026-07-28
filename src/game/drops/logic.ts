/**
 * src/game/drops/logic.ts
 * --------------------------------------------------------------------------
 * Pure effect dispatch for drop pickups. Caller supplies the receivers
 * (character + weapons); this module only decides what the effect does.
 *
 * Returning a small "weapon pickup request" object lets the caller
 * delegate the actual hotbar mutation to whoever owns the weapon system.
 */

import type { DropEffect, DropSpec } from '@/lib/drops';

export interface DropEffectResult {
    /** `true` if the receiving weapon should be swapped (type=weapon). */
    requestWeaponSwap?: string;
}

/**
 * Apply `spec.effect` to the supplied receivers. Pure with respect to
 * side-effecting sinks — callers must invoke the actions (heal, refill,
 * swap) themselves.
 */
export function planDropEffect(
    spec: DropSpec,
    sinks: {
        heal: (hpDelta: number, spDelta: number) => void;
        refillAmmo: (fraction: number) => void;
        onWeaponPickup: (weaponId: string) => void;
    },
): DropEffectResult {
    const e = spec.effect;
    switch (e.type) {
        case 'instant':
            sinks.heal(e.hp ?? 0, e.sp ?? 0);
            return {};
        case 'refill-ammo':
            sinks.refillAmmo(e.ammoFraction);
            return {};
        case 'weapon':
            sinks.onWeaponPickup(e.weaponId);
            return { requestWeaponSwap: e.weaponId };
        default: {
            // exhaustiveness check at compile-time
            const _exhaustive: never = e;
            void _exhaustive;
            return {};
        }
    }
}

/** Re-export of DropSpec / DropEffect for callers that want to bundle them. */
export type { DropEffect, DropSpec };