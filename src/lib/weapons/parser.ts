/**
 * src/lib/weapons/parser.ts
 * --------------------------------------------------------------------------
 * Pure sync parsing + validation. No I/O. Caller supplies the YAML text.
 */

import { load as parseYaml } from 'js-yaml';

import type { BulletSpec, WeaponIndex, WeaponSpec } from './types';

function requirePositiveNumber(value: unknown, label: string, id: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        throw new Error(`Weapon ${id}: ${label} must be a positive number`);
    }
    return value;
}

function parseBullet(raw: unknown, id: string): BulletSpec {
    if (typeof raw !== 'object' || raw === null) {
        throw new Error(`Weapon ${id}: bullet must be an object`);
    }
    const b = raw as Record<string, unknown>;
    return {
        speed: requirePositiveNumber(b.speed, 'bullet.speed', id),
        damage: requirePositiveNumber(b.damage, 'bullet.damage', id),
    };
}

export function parseWeaponYaml(text: string, id: string): WeaponSpec {
    const raw = parseYaml(text) as Record<string, unknown> | null;
    if (raw === null || typeof raw !== 'object') {
        throw new Error(`Weapon ${id}: empty or non-object YAML`);
    }
    const { name, clipSize, reloadTimeMs, fireIntervalMs, bulletsPerShot, bullet } =
        raw;

    if (typeof name !== 'string' || name.length === 0) {
        throw new Error(`Weapon ${id}: name required`);
    }

    return {
        id,
        name,
        clipSize: requirePositiveNumber(clipSize, 'clipSize', id),
        reloadTimeMs: requirePositiveNumber(reloadTimeMs, 'reloadTimeMs', id),
        fireIntervalMs: requirePositiveNumber(fireIntervalMs, 'fireIntervalMs', id),
        bulletsPerShot: requirePositiveNumber(bulletsPerShot, 'bulletsPerShot', id),
        bullet: parseBullet(bullet, id),
    };
}

export function parseWeaponIndex(text: string): WeaponIndex {
    const raw = parseYaml(text) as Record<string, unknown> | null;
    if (raw === null || typeof raw !== 'object') {
        throw new Error('Weapon index: empty or non-object YAML');
    }
    const { weapons } = raw;
    if (!Array.isArray(weapons)) throw new Error('Weapon index: `weapons` must be an array');
    const ids: string[] = [];
    for (let i = 0; i < weapons.length; i++) {
        const id = weapons[i];
        if (typeof id !== 'string' || id.length === 0) {
            throw new Error(`Weapon index: weapons[${i}] must be a non-empty string`);
        }
        ids.push(id);
    }
    return { weapons: ids };
}
