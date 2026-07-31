/**
 * src/lib/monsters/index.ts
 * --------------------------------------------------------------------------
 * Public API for the monsters module.
 */

export type { DropRef, MonsterIndex, MonsterSpec } from './types';
export { parseMonsterIndex, parseMonsterYaml } from './parser';
export { fetchMonster, fetchMonsterIndex } from './loader';
