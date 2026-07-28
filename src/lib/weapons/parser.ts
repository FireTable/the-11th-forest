/**
 * src/lib/weapons/parser.ts
 * --------------------------------------------------------------------------
 * Pure sync parsing + validation. No I/O. Caller supplies the YAML text.
 */

import { load as parseYaml } from 'js-yaml';

import type { WeaponIndex, WeaponSpec } from './types';

function requirePositiveNumber(value: unknown, label: string, id: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        throw new Error(`Weapon ${id}: ${label} must be a positive number`);
    }
    return value;
}

function requireNonNegativeNumber(value: unknown, label: string, id: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw new Error(`Weapon ${id}: ${label} must be a non-negative number`);
    }
    return value;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function parseWeaponYaml(text: string, id: string): WeaponSpec {
    const raw = parseYaml(text) as Record<string, unknown> | null;
    if (raw === null || typeof raw !== 'object') {
        throw new Error(`Weapon ${id}: empty or non-object YAML`);
    }

    if (typeof raw.name !== 'string' || raw.name.length === 0) {
        throw new Error(`Weapon ${id}: name required`);
    }

    const damage = requirePositiveNumber(raw.damage, 'damage', id);
    const cooldownMs = requireNonNegativeNumber(raw.cooldownMs, 'cooldownMs', id);
    const range = requirePositiveNumber(raw.range, 'range', id);

    // Kind inferred from field presence: ranged has projectileSpeed,
    // melee has hitWidth + hitHeight. Exactly one must apply.
    const isRanged = typeof raw.projectileSpeed === 'number';
    const isMelee = typeof raw.hitWidth === 'number' || typeof raw.hitHeight === 'number';

    if (isRanged === isMelee) {
        throw new Error(
            `Weapon ${id}: must be either ranged (projectileSpeed) or melee (hitWidth + hitHeight), not both or neither`,
        );
    }

    if (isRanged) {
        const projectileSpeed = requirePositiveNumber(
            raw.projectileSpeed,
            'projectileSpeed',
            id,
        );
        return {
            id,
            name: raw.name,
            damage,
            cooldownMs,
            range,
            projectileSpeed,
            clipSize: raw.clipSize === undefined
                ? undefined
                : requirePositiveNumber(raw.clipSize, 'clipSize', id),
            reloadTimeMs: raw.reloadTimeMs === undefined
                ? undefined
                : requirePositiveNumber(raw.reloadTimeMs, 'reloadTimeMs', id),
            bulletsPerShot: raw.bulletsPerShot === undefined
                ? undefined
                : requirePositiveNumber(raw.bulletsPerShot, 'bulletsPerShot', id),
        };
    }

    // Melee
    const hitWidth = requirePositiveNumber(raw.hitWidth, 'hitWidth', id);
    const hitHeight = requirePositiveNumber(raw.hitHeight, 'hitHeight', id);
    return {
        id,
        name: raw.name,
        damage,
        cooldownMs,
        range,
        hitWidth,
        hitHeight,
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

// Re-export isPlainObject for tests if needed.
export { isPlainObject };
