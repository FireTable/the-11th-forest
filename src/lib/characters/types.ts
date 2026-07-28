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
    /** Optional sprite-sheet rendering. Absent → fall back to debug rect. */
    sprite?: SpriteSpec;
    /** Named animation tracks; each key maps to a frame range + timing. */
    anims?: Record<string, AnimSpec>;
};

/**
 * Sprite-sheet metadata. The texture path is relative to /public so it
 * resolves under the Vite dev server and the built bundle identically.
 *
 * Cell dimensions are NOT stored here — they're computed at runtime
 * from the texture's natural size divided by `grid` (rows × cols). This
 * keeps the YAML stable when a sheet is regenerated or pixelized to a
 * new resolution.
 *
 * `scale` is the Phaser display multiplier on each cell (1.0 = native).
 * The matter body controls collisions, so `scale` is purely visual and
 * can be tuned per character without touching gameplay.
 */
export type SpriteSpec = {
    texture: string;
    /** Grid layout of the sprite sheet — used to compute cell dims. */
    grid: {
        rows: number;
        cols: number;
    };
    scale: number;
};

/**
 * One Phaser animation track. `frames` is an inclusive [start, end]
 * range over the slice order used by `load.spritesheet` (top-left,
 * left-to-right, top-to-bottom). `repeat = -1` loops; `0` plays once
 * and freezes on the last frame.
 */
export type AnimSpec = {
    frames: [number, number];
    frameRate: number;
    repeat: number;
};

/** Ordered manifest of all characters. */
export type CharacterIndex = {
    characters: string[];
};
