/**
 * src/lib/monsters/loader.ts
 * --------------------------------------------------------------------------
 * Async fetch wrappers. Mirrors src/lib/levels/loader.ts.
 */

import { fetch } from '@/lib/handle-fetch';

import { parseMonsterIndex, parseMonsterYaml } from './parser';
import type { MonsterIndex, MonsterSpec } from './types';

const BASE = '/data/monsters';

export async function fetchMonster(id: string): Promise<MonsterSpec> {
    const text = await (await fetch(`${BASE}/${id}.yaml`)).text();
    return parseMonsterYaml(text, id);
}

export async function fetchMonsterIndex(): Promise<MonsterIndex> {
    const text = await (await fetch(`${BASE}/index.yaml`)).text();
    return parseMonsterIndex(text);
}
