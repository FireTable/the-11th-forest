/**
 * src/lib/levels/loader.ts
 * --------------------------------------------------------------------------
 * Async fetch wrappers around the pure parser. Uses `handle-fetch` so the
 * same `/data/*` paths work in browser and Node without branching.
 */

import { fetch } from '@/lib/handle-fetch';

import { parseLevelIndex, parseLevelYaml } from './parser';
import type { Level, LevelIndex } from './types';

const BASE = '/data/levels';

export async function fetchLevel(id: string): Promise<Level> {
    const text = await (await fetch(`${BASE}/${id}.yaml`)).text();
    return parseLevelYaml(text, id);
}

export async function fetchLevelIndex(): Promise<LevelIndex> {
    const text = await (await fetch(`${BASE}/index.yaml`)).text();
    return parseLevelIndex(text);
}