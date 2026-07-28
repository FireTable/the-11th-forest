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
 */

/** Ranged-projectile visual + physics. Body radius (for collisions)
 *  plus the rect drawn over it (width/height — bullets are usually wider
 *  than their collision radius). */
export type ProjectileVisual = {
    speed: number;
    visual: {
        /** Matter body radius. Defaults to min(width, height) / 2. */
        radius: number;
        /** Rectangle drawn over the body (px). */
        width: number;
        /** Rectangle drawn over the body (px). */
        height: number;
        /** Fill colour, hex literal e.g. 0x22c55e. */
        color: number;
    };
};

export type WeaponSpec = {
    id: string;
    name: string;
    /** Per-hit damage. */
    damage: number;
    /** Time between attacks. Player: between shots. Monster: between attacks. */
    cooldownMs: number;
    /** Effective combat range. For ranged: bullet distance. For melee: hit radius. */
    range: number;
    // ── Ranged fields (player magazine-style) ──────────────────────
    /** Bullets per magazine. Player only. */
    clipSize?: number;
    /** Time to refill magazine. Player only. */
    reloadTimeMs?: number;
    /** Bullets per trigger pull. Shotguns = 5+. Player only. */
    bulletsPerShot?: number;
    /** Projectile visual + speed. Required for ranged weapons. */
    projectile?: ProjectileVisual;
    // ── Melee fields ───────────────────────────────────────────────
    /** Hit-area width. Required for melee weapons. */
    hitWidth?: number;
    /** Hit-area height. Required for melee weapons. */
    hitHeight?: number;
};

/** Ordered manifest of all weapons. */
export type WeaponIndex = {
    weapons: string[];
};
