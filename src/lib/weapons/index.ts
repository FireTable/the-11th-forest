/**
 * src/lib/weapons/index.ts
 * --------------------------------------------------------------------------
 * Public API for the weapons module.
 *
 *   import { parseWeaponYaml, parseWeaponIndex } from '@/lib/weapons';
 *   import { fetchWeapon, fetchWeaponIndex } from '@/lib/weapons';
 */

export type { WeaponSpec, WeaponIndex } from './types';
export { parseWeaponIndex, parseWeaponYaml } from './parser';
export { fetchWeapon, fetchWeaponIndex } from './loader';
