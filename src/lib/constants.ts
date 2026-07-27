/**
 * src/lib/constants.ts
 * --------------------------------------------------------------------------
 * Cross-cutting game constants. Keep here when the value is referenced
 * by more than one module in different folders; otherwise co-locate.
 *
 * Currently:
 *   - Matter collision category bits (CAT) shared by walls and the
 *     test character. Bullet will join when its module lands.
 */

/**
 * Matter collision category bits.
 * ponytail: BULLET still deferred — wall masks can't tighten until both
 * CHARACTER and BULLET exist so we can decide short-wall collisions.
 */
export const CAT = {
    WALL_TALL: 0x0001,
    WALL_SHORT: 0x0002,
    CHARACTER: 0x0004,
    BULLET: 0x0008,
} as const;