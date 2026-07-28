/**
 * src/lib/monsters/parser.ts
 * --------------------------------------------------------------------------
 * Pure sync parsing + validation. No I/O.
 *
 * Monster shape:
 *
 *   name: Drone
 *   hp: 30
 *   moveSpeed: 4
 *   weaponId: drone-claws          # references weapons/{weaponId}.yaml
 *   drops:
 *     - dropId: hp-shard
 *       chance: 0.4
 */

import { load as parseYaml } from 'js-yaml';

import type { DropRef, MonsterIndex, MonsterSpec } from './types';

function requirePositiveNumber(value: unknown, label: string, id: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        throw new Error(`Monster ${id}: ${label} must be a positive number`);
    }
    return value;
}

function requireNonNegativeNumber(value: unknown, label: string, id: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw new Error(`Monster ${id}: ${label} must be a non-negative number`);
    }
    return value;
}

function parseDropRef(raw: unknown, idx: number, id: string): DropRef {
    if (typeof raw !== 'object' || raw === null) {
        throw new Error(`Monster ${id}: drops[${idx}] must be an object`);
    }
    const r = raw as Record<string, unknown>;
    if (typeof r.dropId !== 'string' || r.dropId.length === 0) {
        throw new Error(`Monster ${id}: drops[${idx}].dropId must be a non-empty string`);
    }
    if (
        typeof r.chance !== 'number' ||
        !Number.isFinite(r.chance) ||
        r.chance < 0 ||
        r.chance > 1
    ) {
        throw new Error(`Monster ${id}: drops[${idx}].chance must be a number in [0, 1]`);
    }
    return { dropId: r.dropId, chance: r.chance };
}

export function parseMonsterYaml(text: string, id: string): MonsterSpec {
    const raw = parseYaml(text) as Record<string, unknown> | null;
    if (raw === null || typeof raw !== 'object') {
        throw new Error(`Monster ${id}: empty or non-object YAML`);
    }
    const { name, hp, moveSpeed, weaponId, drops } = raw;

    if (typeof name !== 'string' || name.length === 0) {
        throw new Error(`Monster ${id}: name required`);
    }
    if (typeof weaponId !== 'string' || weaponId.length === 0) {
        throw new Error(`Monster ${id}: weaponId required (e.g. "drone-claws")`);
    }

    const dropsList = Array.isArray(drops) ? drops.map((d, i) => parseDropRef(d, i, id)) : [];

    return {
        id,
        name,
        hp: requireNonNegativeNumber(hp, 'hp', id),
        moveSpeed: requirePositiveNumber(moveSpeed, 'moveSpeed', id),
        weaponId,
        drops: dropsList,
    };
}

export function parseMonsterIndex(text: string): MonsterIndex {
    const raw = parseYaml(text) as Record<string, unknown> | null;
    if (raw === null || typeof raw !== 'object') {
        throw new Error('Monster index: empty or non-object YAML');
    }
    const { monsters } = raw;
    if (!Array.isArray(monsters)) throw new Error('Monster index: `monsters` must be an array');
    const ids: string[] = [];
    for (let i = 0; i < monsters.length; i++) {
        const m = monsters[i];
        if (typeof m !== 'string' || m.length === 0) {
            throw new Error(`Monster index: monsters[${i}] must be a non-empty string`);
        }
        ids.push(m);
    }
    return { monsters: ids };
}