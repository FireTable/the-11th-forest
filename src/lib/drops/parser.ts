/**
 * src/lib/drops/parser.ts
 * --------------------------------------------------------------------------
 * Pure sync parsing + validation. No I/O.
 */

import { load as parseYaml } from 'js-yaml';

import type { DropEffect, DropIndex, DropKind, DropSpec, DropType, DropVisual } from './types';

const VALID_TYPES: ReadonlySet<DropType> = new Set(['instant', 'refill-ammo', 'weapon']);
const VALID_KINDS: ReadonlySet<DropKind> = new Set(['static', 'monster']);

function parseVisual(raw: unknown, id: string): DropVisual {
    if (typeof raw !== 'object' || raw === null) {
        throw new Error(`Drop ${id}: visual must be an object with size, tint`);
    }
    const v = raw as Record<string, unknown>;
    if (typeof v.size !== 'number' || !Number.isFinite(v.size) || v.size <= 0) {
        throw new Error(`Drop ${id}: visual.size must be a positive finite number`);
    }
    if (typeof v.tint !== 'number' || !Number.isFinite(v.tint)) {
        throw new Error(`Drop ${id}: visual.tint must be a number (hex literal like 0x22c55e)`);
    }
    return { size: v.size, tint: v.tint };
}

function parseEffect(raw: unknown, id: string): DropEffect {
    if (typeof raw !== 'object' || raw === null) {
        throw new Error(`Drop ${id}: effect must be an object`);
    }
    const e = raw as Record<string, unknown>;
    if (typeof e.type !== 'string' || !VALID_TYPES.has(e.type as DropType)) {
        throw new Error(`Drop ${id}: effect.type must be 'instant' | 'refill-ammo' | 'weapon'`);
    }
    const t = e.type as DropType;

    if (t === 'instant') {
        const hp = typeof e.hp === 'number' && Number.isFinite(e.hp) ? e.hp : 0;
        const sp = typeof e.sp === 'number' && Number.isFinite(e.sp) ? e.sp : 0;
        if (hp <= 0 && sp <= 0) {
            throw new Error(`Drop ${id}: instant effect needs hp > 0 or sp > 0`);
        }
        return { type: 'instant', hp, sp };
    }
    if (t === 'refill-ammo') {
        if (
            typeof e.ammoFraction !== 'number' ||
            !Number.isFinite(e.ammoFraction) ||
            e.ammoFraction <= 0 ||
            e.ammoFraction > 1
        ) {
            throw new Error(`Drop ${id}: refill-ammo effect needs ammoFraction in (0, 1]`);
        }
        return { type: 'refill-ammo', ammoFraction: e.ammoFraction };
    }
    // 'weapon'
    if (typeof e.weaponId !== 'string' || e.weaponId.length === 0) {
        throw new Error(`Drop ${id}: weapon effect needs weaponId`);
    }
    return { type: 'weapon', weaponId: e.weaponId };
}

export function parseDropYaml(text: string, id: string): DropSpec {
    const raw = parseYaml(text) as Record<string, unknown> | null;
    if (raw === null || typeof raw !== 'object') {
        throw new Error(`Drop ${id}: empty or non-object YAML`);
    }
    const { name, kind, visual, effect } = raw;

    if (typeof name !== 'string' || name.length === 0) {
        throw new Error(`Drop ${id}: name required`);
    }
    if (typeof kind !== 'string' || !VALID_KINDS.has(kind as DropKind)) {
        throw new Error(`Drop ${id}: kind must be 'static' | 'monster'`);
    }

    return {
        id,
        name,
        kind: kind as DropKind,
        visual: parseVisual(visual, id),
        effect: parseEffect(effect, id),
    };
}

export function parseDropIndex(text: string): DropIndex {
    const raw = parseYaml(text) as Record<string, unknown> | null;
    if (raw === null || typeof raw !== 'object') {
        throw new Error('Drop index: empty or non-object YAML');
    }
    const { drops } = raw;
    if (!Array.isArray(drops)) throw new Error('Drop index: `drops` must be an array');
    const ids: string[] = [];
    for (let i = 0; i < drops.length; i++) {
        const d = drops[i];
        if (typeof d !== 'string' || d.length === 0) {
            throw new Error(`Drop index: drops[${i}] must be a non-empty string`);
        }
        ids.push(d);
    }
    return { drops: ids };
}
