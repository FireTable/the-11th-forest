/**
 * src/lib/characters/types.ts
 * --------------------------------------------------------------------------
 * Character base stats. One YAML per character.
 *
 *   id              — required; matches the filename and is verified by
 *                     the loader (mismatch throws)
 *   hp / sp         — base pools at full health/stamina
 *   moveSpeed       — px/sec top-down
 *   spRegenMs       — time to refill SP from 0 to max
 *   body            — physical body dimensions (Matter rectangle)
 *   dodge           — Shift-dodge parameters (SP cost, speed, timing)
 *   hotbar          — starting weapon IDs in display order
 *                    (mutable in memory: future pickups swap entries)
 */

export type CharacterSpec = {
    id: string;
    name: string;
    hp: number;
    sp: number;
    moveSpeed: number;
    spRegenMs: number;
    body: {
        /** Half-width in px. Matter body width = 2 * halfW. */
        halfW: number;
        /** Half-height in px. Matter body height = 2 * halfH. */
        halfH: number;
    };
    dodge: {
        /** SP spent per Shift dodge. */
        spCost: number;
        /** Px / physics step during the dash (kept low to avoid tunneling). */
        speed: number;
        /** Total duration of the dash. */
        durationMs: number;
        /** Minimum gap between consecutive dodges. */
        cooldownMs: number;
    };
    /** Weapon IDs the character starts with, in hotbar display order. */
    hotbar: string[];
};

/** Ordered manifest of all characters. */
export type CharacterIndex = {
    characters: string[];
};
