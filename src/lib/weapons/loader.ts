/**
 * src/lib/weapons/loader.ts
 * --------------------------------------------------------------------------
 * Async fetch wrappers around the pure parser. Uses `handle-fetch` so the
 * same `/data/*` paths work in browser and Node without branching.
 */

import { fetch } from '@/lib/handle-fetch';

import { parseWeaponIndex, parseWeaponYaml } from './parser';
import type { WeaponIndex, WeaponSpec } from './types';

const BASE = '/data/weapons';

export async function fetchWeapon(id: string): Promise<WeaponSpec> {
    const text = await (await fetch(`${BASE}/${id}.yaml`)).text();
    return parseWeaponYaml(text, id);
}

export async function fetchWeaponIndex(): Promise<WeaponIndex> {
    const text = await (await fetch(`${BASE}/index.yaml`)).text();
    return parseWeaponIndex(text);
}
