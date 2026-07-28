/**
 * src/lib/monsters/types.ts
 * --------------------------------------------------------------------------
 * Monster runtime data. One YAML per monster type, no `id` field.
 *
 *   kind = 'melee'  → contact damage (CAT.MONSTER_MELEE on collisionstart)
 *   kind = 'ranged' → fires a projectile at attack range
 *
 * `drops` is a weighted list rolled on death (chance 0..1).
 */

export type MonsterKind = 'melee' | 'ranged';

export type MonsterProjectile = {
    speed: number;
    damage: number;
};

/** Reference to a drop spec, with weighted chance of being dropped on death. */
export type DropRef = {
    dropId: string;
    chance: number; // 0..1, total rolls weighted by chance — independent rolls
};

export type MonsterSpec = {
    id: string;
    name: string;
    hp: number;
    moveSpeed: number;
    kind: MonsterKind;
    attackRange: number; // px
    attackIntervalMs: number;
    contactDamage?: number; // only melee
    projectile?: MonsterProjectile; // only ranged
    drops: DropRef[];
};

/** Ordered manifest of all monster types. */
export type MonsterIndex = {
    monsters: string[];
};
