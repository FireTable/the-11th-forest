/**
 * src/lib/levels/parser.ts
 * --------------------------------------------------------------------------
 * Pure sync parsing + validation. No I/O. Caller supplies the YAML text.
 *
 * Lives apart from loader.ts so tests can hit parsing logic without
 * touching fetch or fs.
 */

import { load as parseYaml } from 'js-yaml';

import {
    parseImageSize,
    type AirWall,
    type AirWallKind,
    type Level,
    type LevelIndex,
} from './types';

const VALID_KINDS: ReadonlySet<AirWallKind> = new Set(['tall', 'short']);

function parseAirWall(raw: unknown, idx: number): AirWall {
    if (typeof raw !== 'object' || raw === null) {
        throw new Error(`airWalls[${idx}] must be an object`);
    }
    const w = raw as Record<string, unknown>;
    const { id, kind, x, y, width, height } = w;
    if (typeof id !== 'string' || id.length === 0) {
        throw new Error(`airWalls[${idx}].id must be a non-empty string`);
    }
    if (kind !== 'tall' && kind !== 'short') {
        throw new Error(`airWalls[${idx}].kind must be 'tall' or 'short', got ${JSON.stringify(kind)}`);
    }
    if (!VALID_KINDS.has(kind)) {
        throw new Error(`airWalls[${idx}].kind must be 'tall' or 'short', got ${JSON.stringify(kind)}`);
    }
    if (typeof x !== 'number' || typeof y !== 'number') {
        throw new Error(`airWalls[${idx}] x/y must be numbers`);
    }
    if (typeof width !== 'number' || width <= 0) {
        throw new Error(`airWalls[${idx}].width must be > 0`);
    }
    if (typeof height !== 'number' || height <= 0) {
        throw new Error(`airWalls[${idx}].height must be > 0`);
    }
    return { id, kind, x, y, width, height };
}

/**
 * Parse a level YAML string. `id` is supplied by the caller (filename
 * sans .yaml) — it is NOT stored in the data.
 */
export function parseLevelYaml(text: string, id: string): Level {
    const raw = parseYaml(text) as Record<string, unknown> | null;
    if (raw === null || typeof raw !== 'object') {
        throw new Error(`Level ${id}: empty or non-object YAML`);
    }

    const { title, background, imageSize, promptFile, airWalls } = raw;
    if (typeof title !== 'string' || title.length === 0) throw new Error(`Level ${id}: title required`);
    if (typeof background !== 'string' || background.length === 0) throw new Error(`Level ${id}: background required`);
    if (typeof imageSize !== 'string') throw new Error(`Level ${id}: imageSize required (string "WxH")`);
    if (typeof promptFile !== 'string') throw new Error(`Level ${id}: promptFile required`);

    const size = parseImageSize(imageSize);
    const walls = Array.isArray(airWalls) ? airWalls.map((w, i) => parseAirWall(w, i)) : [];

    return { title, background, imageSize: size, promptFile, airWalls: walls };
}

/**
 * Parse the level manifest. Returns the ordered list of scene ids.
 */
export function parseLevelIndex(text: string): LevelIndex {
    const raw = parseYaml(text) as Record<string, unknown> | null;
    if (raw === null || typeof raw !== 'object') {
        throw new Error('Level index: empty or non-object YAML');
    }
    const { levels } = raw;
    if (!Array.isArray(levels)) throw new Error('Level index: `levels` must be an array');
    const ids: string[] = [];
    for (let i = 0; i < levels.length; i++) {
        const id = levels[i];
        if (typeof id !== 'string' || id.length === 0) {
            throw new Error(`Level index: levels[${i}] must be a non-empty string`);
        }
        ids.push(id);
    }
    return { levels: ids };
}