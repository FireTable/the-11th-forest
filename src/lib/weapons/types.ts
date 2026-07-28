/**
 * src/lib/weapons/types.ts
 * --------------------------------------------------------------------------
 * Runtime weapon data. One YAML per weapon, no `id` field — filename is the id.
 *
 * Weapons are magazine-style:
 *   clipSize        — bullets per magazine
 *   reloadTimeMs    — duration of a full reload (head indicator tracks this)
 *   fireIntervalMs  — ms between shots when holding fire
 *   bulletsPerShot  — bullets consumed/spawned per trigger pull (shotguns = 5+)
 *   bullet.{speed,damage} — straight-line bullet physics
 */

export type BulletSpec = {
    /** px/sec — bullet moves at this rate */
    speed: number;
    /** HP dealt on hit */
    damage: number;
};

export type WeaponSpec = {
    id: string;
    name: string;
    clipSize: number;
    reloadTimeMs: number;
    fireIntervalMs: number;
    bulletsPerShot: number;
    bullet: BulletSpec;
};

/** Ordered manifest of all weapons. */
export type WeaponIndex = {
    weapons: string[];
};
