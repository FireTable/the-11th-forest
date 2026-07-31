/**
 * src/lib/characters/loader.ts
 * --------------------------------------------------------------------------
 * Async fetch wrappers. Mirrors src/lib/levels/loader.ts.
 */

import { fetch } from '@/lib/handle-fetch';

import { parseCharacterIndex, parseCharacterYaml } from './parser';
import type { CharacterIndex, CharacterSpec } from './types';

const BASE = '/data/characters';

export async function fetchCharacter(id: string): Promise<CharacterSpec> {
    const text = await (await fetch(`${BASE}/${id}.yaml`)).text();
    return parseCharacterYaml(text, id);
}

export async function fetchCharacterIndex(): Promise<CharacterIndex> {
    const text = await (await fetch(`${BASE}/index.yaml`)).text();
    return parseCharacterIndex(text);
}
