/**
 * src/lib/characters/parser.ts
 * --------------------------------------------------------------------------
 * Pure sync parsing + validation. No I/O.
 */

import { load as parseYaml } from 'js-yaml';

import type { AnimSpec, CharacterIndex, CharacterSpec, SpriteSpec } from './types';

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
    const {
        id: yamlId,
        name,
        hp,
        sp,
        moveSpeed,
        spRegenMs,
        body,
        dodge,
        hotbar,
        sprite,
        anims,
    } = raw;

    if (typeof name !== 'string' || name.length === 0) {
        throw new Error(`Character ${id}: name required`);
    }
    if (yamlId !== undefined && yamlId !== id) {
        throw new Error(
            `Character ${id}: yaml id "${yamlId}" doesn't match filename — keep them in sync`,
        );
    }

    const spec: CharacterSpec = {
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
    if (sprite !== undefined) spec.sprite = parseSprite(sprite, id);
    if (anims !== undefined) spec.anims = parseAnims(anims, id);
    return spec;
}

function parseSprite(raw: unknown, id: string): SpriteSpec {
    if (typeof raw !== 'object' || raw === null) {
        throw new Error(
            `Character ${id}: sprite must be an object with texture, frameWidth, frameHeight`,
        );
    }
    const s = raw as Record<string, unknown>;
    if (typeof s.texture !== 'string' || s.texture.length === 0) {
        throw new Error(`Character ${id}: sprite.texture must be a non-empty string`);
    }
    return {
        texture: s.texture,
        frameWidth: requirePositiveFinite(s.frameWidth, 'sprite.frameWidth', id),
        frameHeight: requirePositiveFinite(s.frameHeight, 'sprite.frameHeight', id),
        scale: requirePositiveFinite(s.scale, 'sprite.scale', id),
    };
}

function parseAnims(raw: unknown, id: string): Record<string, AnimSpec> {
    if (typeof raw !== 'object' || raw === null) {
        throw new Error(`Character ${id}: anims must be an object`);
    }
    const r = raw as Record<string, unknown>;
    const out: Record<string, AnimSpec> = {};
    for (const [key, value] of Object.entries(r)) {
        out[key] = parseAnimSpec(value, key, id);
    }
    return out;
}

function parseAnimSpec(raw: unknown, key: string, id: string): AnimSpec {
    if (typeof raw !== 'object' || raw === null) {
        throw new Error(`Character ${id}: anims.${key} must be an object`);
    }
    const a = raw as Record<string, unknown>;
    if (!Array.isArray(a.frames) || a.frames.length !== 2) {
        throw new Error(`Character ${id}: anims.${key}.frames must be a tuple [start, end]`);
    }
    const [start, end] = a.frames;
    if (
        typeof start !== 'number' ||
        typeof end !== 'number' ||
        !Number.isInteger(start) ||
        !Number.isInteger(end) ||
        start < 0 ||
        end < start
    ) {
        throw new Error(
            `Character ${id}: anims.${key}.frames[0] (${start}) must be >= 0 and <= frames[1] (${end})`,
        );
    }
    if (typeof a.repeat !== 'number' || !Number.isInteger(a.repeat)) {
        throw new Error(
            `Character ${id}: anims.${key}.repeat must be an integer (-1 = loop, 0 = once)`,
        );
    }
    return {
        frames: [start, end],
        frameRate: requirePositiveFinite(a.frameRate, `anims.${key}.frameRate`, id),
        repeat: a.repeat,
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
