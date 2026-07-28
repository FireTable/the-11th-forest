/**
 * src/lib/characters/parser.ts
 * --------------------------------------------------------------------------
 * Pure sync parsing + validation. No I/O.
 */

import { load as parseYaml } from 'js-yaml';

import type { CharacterIndex, CharacterSpec } from './types';

function requireNonNegativeFinite(value: unknown, label: string, id: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw new Error(`Character ${id}: ${label} must be a non-negative finite number`);
    }
    return value;
}

function requirePositiveFinite(value: unknown, label: string, id: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        throw new Error(`Character ${id}: ${label} must be a positive finite number`);
    }
    return value;
}

export function parseCharacterYaml(text: string, id: string): CharacterSpec {
    const raw = parseYaml(text) as Record<string, unknown> | null;
    if (raw === null || typeof raw !== 'object') {
        throw new Error(`Character ${id}: empty or non-object YAML`);
    }
    const { name, hp, sp, moveSpeed, dodgeSpCost, spRegenMs } = raw;

    if (typeof name !== 'string' || name.length === 0) {
        throw new Error(`Character ${id}: name required`);
    }

    return {
        id,
        name,
        hp: requireNonNegativeFinite(hp, 'hp', id),
        sp: requireNonNegativeFinite(sp, 'sp', id),
        moveSpeed: requirePositiveFinite(moveSpeed, 'moveSpeed', id),
        dodgeSpCost: requireNonNegativeFinite(dodgeSpCost, 'dodgeSpCost', id),
        spRegenMs: requirePositiveFinite(spRegenMs, 'spRegenMs', id),
    };
}

export function parseCharacterIndex(text: string): CharacterIndex {
    const raw = parseYaml(text) as Record<string, unknown> | null;
    if (raw === null || typeof raw !== 'object') {
        throw new Error('Character index: empty or non-object YAML');
    }
    const { characters } = raw;
    if (!Array.isArray(characters)) throw new Error('Character index: `characters` must be an array');
    const ids: string[] = [];
    for (let i = 0; i < characters.length; i++) {
        const c = characters[i];
        if (typeof c !== 'string' || c.length === 0) {
            throw new Error(`Character index: characters[${i}] must be a non-empty string`);
        }
        ids.push(c);
    }
    return { characters: ids };
}
