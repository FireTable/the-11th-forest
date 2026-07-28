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

function parseBody(raw: unknown, id: string): { halfW: number; halfH: number } {
    if (typeof raw !== 'object' || raw === null) {
        throw new Error(`Character ${id}: body must be an object with halfW, halfH`);
    }
    const b = raw as Record<string, unknown>;
    return {
        halfW: requirePositiveFinite(b.halfW, 'body.halfW', id),
        halfH: requirePositiveFinite(b.halfH, 'body.halfH', id),
    };
}

function parseDodge(raw: unknown, id: string): {
    spCost: number; speed: number; durationMs: number; cooldownMs: number;
} {
    if (typeof raw !== 'object' || raw === null) {
        throw new Error(`Character ${id}: dodge must be an object with spCost, speed, durationMs, cooldownMs`);
    }
    const d = raw as Record<string, unknown>;
    return {
        spCost: requireNonNegativeFinite(d.spCost, 'dodge.spCost', id),
        speed: requirePositiveFinite(d.speed, 'dodge.speed', id),
        durationMs: requirePositiveFinite(d.durationMs, 'dodge.durationMs', id),
        cooldownMs: requirePositiveFinite(d.cooldownMs, 'dodge.cooldownMs', id),
    };
}

export function parseCharacterYaml(text: string, id: string): CharacterSpec {
    const raw = parseYaml(text) as Record<string, unknown> | null;
    if (raw === null || typeof raw !== 'object') {
        throw new Error(`Character ${id}: empty or non-object YAML`);
    }
    const { id: yamlId, name, hp, sp, moveSpeed, spRegenMs, body, dodge, hotbar } = raw;

    if (typeof name !== 'string' || name.length === 0) {
        throw new Error(`Character ${id}: name required`);
    }
    if (yamlId !== undefined && yamlId !== id) {
        throw new Error(
            `Character ${id}: yaml id "${yamlId}" doesn't match filename — keep them in sync`,
        );
    }

    return {
        id,
        name,
        hp: requireNonNegativeFinite(hp, 'hp', id),
        sp: requireNonNegativeFinite(sp, 'sp', id),
        moveSpeed: requirePositiveFinite(moveSpeed, 'moveSpeed', id),
        spRegenMs: requirePositiveFinite(spRegenMs, 'spRegenMs', id),
        body: parseBody(body, id),
        dodge: parseDodge(dodge, id),
        hotbar: parseHotbar(hotbar, id),
    };
}

function parseHotbar(raw: unknown, id: string): string[] {
    if (!Array.isArray(raw) || raw.length === 0) {
        throw new Error(`Character ${id}: hotbar must be a non-empty array of weapon IDs`);
    }
    const out: string[] = [];
    for (let i = 0; i < raw.length; i++) {
        const v = raw[i];
        if (typeof v !== 'string' || v.length === 0) {
            throw new Error(`Character ${id}: hotbar[${i}] must be a non-empty weapon ID string`);
        }
        out.push(v);
    }
    return out;
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
