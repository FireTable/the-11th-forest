/**
 * src/lib/constants.ts
 * --------------------------------------------------------------------------
 * Cross-cutting game constants. Keep here when the value is referenced
 * by more than one module in different folders; otherwise co-locate.
 *
 * Currently:
 *   - Matter collision category bits (CAT) shared by walls, the player,
 *     player bullets, melee monsters, and ranged-monster projectiles.
 *
 *   bit          category            collides with mask
 *   ----         --------            -------------------
 *   0x0001       WALL_TALL           CHARACTER | BULLET
 *   0x0002       WALL_SHORT          CHARACTER
 *   0x0004       CHARACTER           WALL_TALL | WALL_SHORT | MONSTER_MELEE | MONSTER_PROJECTILE
 *   0x0008       BULLET (player)     WALL_TALL | WALL_SHORT | MONSTER_MELEE | MONSTER_PROJECTILE | CHARACTER-mech
 *   0x0010       MONSTER_MELEE       CHARACTER
 *   0x0020       MONSTER_PROJECTILE  CHARACTER
 */

export const CAT = {
    WALL_TALL: 0x0001,
    WALL_SHORT: 0x0002,
    CHARACTER: 0x0004,
    BULLET: 0x0008,
    MONSTER_MELEE: 0x0010,
    MONSTER_PROJECTILE: 0x0020,
    /** Composite mask: things that block player movement. */
    WALL_PLAYER_MASK: 0x0001 | 0x0002,
    /** Composite mask: things the player body collides with for damage. */
    CHARACTER_DAMAGE_MASK: 0x0001 | 0x0002 | 0x0010 | 0x0020,
    /** Composite mask: things the player's bullets should hit. */
    BULLET_HIT_MASK: 0x0001 | 0x0002 | 0x0010 | 0x0020,
    /** Composite mask: drop pickups (only the character triggers them). */
    DROP_PICKUP_MASK: 0x0004,
} as const;
