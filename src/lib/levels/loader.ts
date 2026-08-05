/**
 * src/lib/levels/loader.ts
 * --------------------------------------------------------------------------
 * Async fetch wrappers around the pure parser. Uses `handle-fetch` so the
 * same `/data/*` paths work in browser and Node without branching.
 */

import { clearFetchCache, fetch } from '@/lib/handle-fetch';

import { parseLevelIndex, parseLevelYaml } from './parser';
import type { Level, LevelIndex } from './types';

const BASE = '/data/levels';

export async function fetchLevel(id: string): Promise<Level> {
    const text = await (await fetch(`${BASE}/${id}.yaml`)).text();
    return parseLevelYaml(text, id);
}

export async function fetchLevelIndex(forceRefresh = false): Promise<LevelIndex> {
    if (forceRefresh) {
        clearFetchCache(`${BASE}/index.yaml`);
    }
    const text = await (await fetch(`${BASE}/index.yaml`)).text();
    return parseLevelIndex(text);
}

export function clearLevelIndexCache(): void {
    clearFetchCache(`${BASE}/index.yaml`);
}
