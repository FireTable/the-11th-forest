/**
 * src/lib/monsters/parser.ts
 * --------------------------------------------------------------------------
 * Pure sync parsing + validation. No I/O.
 *
 * Monster shapes:
 *
 *   Melee example:
 *     name: Drone
 *     hp: 30
 *     moveSpeed: 4
 *     kind: melee
 *     attackRange: 36
 *     attackIntervalMs: 1000
 *     contactDamage: 8
 *     drops:
 *       - dropId: hp-shard
 *         chance: 0.4
 *
 *   Ranged example:
 *     name: Gunner
 *     hp: 20
 *     moveSpeed: 3
 *     kind: ranged
 *     attackRange: 200
 *     attackIntervalMs: 1500
 *     projectile:
 *       speed: 14
 *       damage: 6
 *     drops: []
 */

import { load as parseYaml } from 'js-yaml';

import type {
    DropRef,
    MonsterIndex,
    MonsterKind,
    MonsterProjectile,
    MonsterSpec,
} from './types';

const VALID_KINDS: ReadonlySet<MonsterKind> = new Set(['melee', 'ranged']);

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

function parseProjectile(raw: unknown, id: string): MonsterProjectile {
    if (typeof raw !== 'object' || raw === null) {
        throw new Error(`Monster ${id}: projectile must be an object`);
    }
    const p = raw as Record<string, unknown>;
    return {
        speed: requirePositiveNumber(p.speed, 'projectile.speed', id),
        damage: requirePositiveNumber(p.damage, 'projectile.damage', id),
    };
}

export function parseMonsterYaml(text: string, id: string): MonsterSpec {
    const raw = parseYaml(text) as Record<string, unknown> | null;
    if (raw === null || typeof raw !== 'object') {
        throw new Error(`Monster ${id}: empty or non-object YAML`);
    }
    const {
        name,
        hp,
        moveSpeed,
        kind,
        attackRange,
        attackIntervalMs,
        contactDamage,
        projectile,
        drops,
    } = raw;

    if (typeof name !== 'string' || name.length === 0) {
        throw new Error(`Monster ${id}: name required`);
    }
    if (typeof kind !== 'string' || !VALID_KINDS.has(kind as MonsterKind)) {
        throw new Error(`Monster ${id}: kind must be 'melee' or 'ranged'`);
    }
    const kindResolved = kind as MonsterKind;

    const dropsList = Array.isArray(drops) ? drops.map((d, i) => parseDropRef(d, i, id)) : [];

    const base: MonsterSpec = {
        id,
        name,
        hp: requireNonNegativeNumber(hp, 'hp', id),
        moveSpeed: requirePositiveNumber(moveSpeed, 'moveSpeed', id),
        kind: kindResolved,
        attackRange: requirePositiveNumber(attackRange, 'attackRange', id),
        attackIntervalMs: requirePositiveNumber(attackIntervalMs, 'attackIntervalMs', id),
        drops: dropsList,
    };

    if (kindResolved === 'melee') {
        // contactDamage is required for melee
        return {
            ...base,
            contactDamage: requirePositiveNumber(contactDamage, 'contactDamage', id),
        };
    }
    // ranged: projectile required
    return {
        ...base,
        projectile: parseProjectile(projectile, id),
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
