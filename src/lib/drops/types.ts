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
 */

export type DropType = 'instant' | 'refill-ammo' | 'weapon';

export type DropKind = 'static' | 'monster';

export type DropEffect =
    | { type: 'instant'; hp?: number; sp?: number }
    | { type: 'refill-ammo'; ammoFraction: number }
    | { type: 'weapon'; weaponId: string };

export type DropSpec = {
    id: string;
    name: string;
    /** Default kind: 'static' for scene-placed, 'monster' for killed-by drops. */
    kind: DropKind;
    visual: DropVisual;
    effect: DropEffect;
};

/** Sensor rect size + tint (hex, e.g. 0x22c55e). One tint per drop. */
export type DropVisual = {
    size: number;
    tint: number;
};

/** Ordered manifest of all drops. */
export type DropIndex = {
    drops: string[];
};
