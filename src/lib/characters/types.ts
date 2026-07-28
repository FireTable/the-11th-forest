/**
 * src/lib/characters/types.ts
 * --------------------------------------------------------------------------
 * Character base stats. One YAML per character, no `id` field.
 *
 * Stats only — the actual `Character` runtime entity (Phaser side,
 * src/game/characters/) owns positioning, weapons, drops, and HUD.
 *
 *   hp / sp          — base pools at full health/stamina
 *   moveSpeed        — px/sec top-down
 *   dodgeSpCost      — SP spent per Shift dodge
 *   spRegenMs        — time to refill SP from 0 to max
 */

export type CharacterSpec = {
    id: string;
    name: string;
    hp: number;
    sp: number;
    moveSpeed: number;
    dodgeSpCost: number;
    spRegenMs: number;
};

/** Ordered manifest of all characters. */
export type CharacterIndex = {
    characters: string[];
};
