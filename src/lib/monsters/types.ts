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
 */

export type DropRef = {
    dropId: string;
    chance: number; // 0..1, total rolls weighted by chance — independent rolls
};

export type MonsterSpec = {
    id: string;
    name: string;
    hp: number;
    moveSpeed: number;
    body: {
        halfW: number;
        halfH: number;
    };
    /** ID of a weapons/{id}.yaml — provides damage, range, cooldown, kind. */
    weaponId: string;
    drops: DropRef[];
};

/** Ordered manifest of all monster types. */
export type MonsterIndex = {
    monsters: string[];
};
