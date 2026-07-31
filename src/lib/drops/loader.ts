/**
 * src/lib/drops/loader.ts
 * --------------------------------------------------------------------------
 * Async fetch wrappers.
 */

import { fetch } from '@/lib/handle-fetch';

import { parseDropIndex, parseDropYaml } from './parser';
import type { DropIndex, DropSpec } from './types';

const BASE = '/data/drops';

export async function fetchDrop(id: string): Promise<DropSpec> {
    const text = await (await fetch(`${BASE}/${id}.yaml`)).text();
    return parseDropYaml(text, id);
}

export async function fetchDropIndex(): Promise<DropIndex> {
    const text = await (await fetch(`${BASE}/index.yaml`)).text();
    return parseDropIndex(text);
}
