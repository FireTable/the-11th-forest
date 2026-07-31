/**
 * src/lib/characters/index.ts
 * --------------------------------------------------------------------------
 * Public API for the characters module.
 *
 *   import { parseCharacterYaml } from '@/lib/characters';
 *   import { fetchCharacter } from '@/lib/characters';
 */

export type { AnimSpec, CharacterIndex, CharacterSpec, SpriteSpec } from './types';
export { parseCharacterIndex, parseCharacterYaml } from './parser';
export { fetchCharacter, fetchCharacterIndex } from './loader';
