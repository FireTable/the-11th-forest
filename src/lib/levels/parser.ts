/**
 * src/lib/levels/parser.ts
 * --------------------------------------------------------------------------
 * Pure sync parsing + validation. No I/O. Caller supplies the YAML text.
 *
 * Lives apart from loader.ts so tests can hit parsing logic without
 * touching fetch or fs.
 *
 * Air wall schema (current):
 *   airWalls:
 *     - id: wall-1
 *       kind: tall
 *       points:
 *         - [10, 20]
 *         - [40, 20]
 *         - [40, 60]
 *         - [10, 60]
 *
 * Legacy rect schema is still accepted and migrated:
 *   - { id, kind, x, y, width, height } → 4-vertex polygon
 */

import { load as parseYaml } from 'js-yaml';

import { rectToPoints } from '@/lib/editor/polygon';

import {
    parseImageSize,
    type AirWall,
    type AirWallKind,
    type AirWallVertex,
    type DropSpawn,
    type Level,
    type LevelIndex,
    type MonsterSpawn,
} from './types';

const VALID_KINDS: ReadonlySet<AirWallKind> = new Set(['tall', 'short']);

function validateKind(kind: unknown, idx: number): AirWallKind {
    if (kind !== 'tall' && kind !== 'short') {
        throw new Error(
            `airWalls[${idx}].kind must be 'tall' or 'short', got ${JSON.stringify(kind)}`,
        );
    }
    if (!VALID_KINDS.has(kind)) {
        throw new Error(
            `airWalls[${idx}].kind must be 'tall' or 'short', got ${JSON.stringify(kind)}`,
        );
    }
    return kind;
}

function parseVertices(raw: unknown, idx: number): AirWallVertex[] {
    if (!Array.isArray(raw)) {
        throw new Error(`airWalls[${idx}].points must be an array of [x, y] pairs`);
    }
    if (raw.length < 3) {
        throw new Error(`airWalls[${idx}].points must have at least 3 vertices`);
    }
    return raw.map((entry, j) => {
        if (!Array.isArray(entry) || entry.length !== 2) {
            throw new Error(`airWalls[${idx}].points[${j}] must be a [x, y] pair`);
        }
        const [x, y] = entry;
        if (typeof x !== 'number' || typeof y !== 'number') {
            throw new Error(`airWalls[${idx}].points[${j}] must be two numbers`);
        }
        return [Math.round(x), Math.round(y)] as AirWallVertex;
    });
}

function parseAirWall(raw: unknown, idx: number): AirWall {
    if (typeof raw !== 'object' || raw === null) {
        throw new Error(`airWalls[${idx}] must be an object`);
    }
    const w = raw as Record<string, unknown>;

    if (typeof w.id !== 'string' || w.id.length === 0) {
        throw new Error(`airWalls[${idx}].id must be a non-empty string`);
    }
    const kind = validateKind(w.kind, idx);

    // New schema: points array.
    if (w.points !== undefined) {
        return { id: w.id, kind, points: parseVertices(w.points, idx) };
    }

    // Legacy schema: x / y / width / height.
    if (
        typeof w.x === 'number' &&
        typeof w.y === 'number' &&
        typeof w.width === 'number' &&
        typeof w.height === 'number' &&
        w.width > 0 &&
        w.height > 0
    ) {
        const rect = rectToPoints(w.x, w.y, w.width, w.height);
        return {
            id: w.id,
            kind,
            points: rect.map((p) => [p.x, p.y] as AirWallVertex),
        };
    }

    throw new Error(
        `airWalls[${idx}] must have either \`points: [[x, y], ...]\` or legacy \`x/y/width/height\``,
    );
}

/**
 * Parse a level YAML string. `id` is supplied by the caller (filename
 * sans .yaml) — it is NOT stored in the data.
 *
 * Optional Phase-1+ fields:
 *   character:  string                # character id (no extra config; just the id)
 *   monsters:   [{ type: id, at: [x, y] }, ...]
 *   dropSpawns: [{ type: id, at: [x, y] }, ...]
 *
 * Missing fields are simply absent — no default monster spawns unless listed.
 */
export function parseLevelYaml(text: string, id: string): Level {
    const raw = parseYaml(text) as Record<string, unknown> | null;
    if (raw === null || typeof raw !== 'object') {
        throw new Error(`Level ${id}: empty or non-object YAML`);
    }

    const { title, background, imageSize, promptFile, airWalls, character, monsters, dropSpawns } =
        raw;
    if (typeof title !== 'string' || title.length === 0) throw new Error(`Level ${id}: title required`);
    if (typeof background !== 'string' || background.length === 0) throw new Error(`Level ${id}: background required`);
    if (typeof imageSize !== 'string') throw new Error(`Level ${id}: imageSize required (string "WxH")`);
    if (typeof promptFile !== 'string') throw new Error(`Level ${id}: promptFile required`);

    const size = parseImageSize(imageSize);
    const walls = Array.isArray(airWalls) ? airWalls.map((w, i) => parseAirWall(w, i)) : [];

    const result: Level = {
        title,
        background,
        imageSize: size,
        promptFile,
        airWalls: walls,
    };

    if (character !== undefined) {
        if (typeof character !== 'string' || character.length === 0) {
            throw new Error(`Level ${id}: character must be a non-empty string`);
        }
        result.character = character;
    }

    if (monsters !== undefined) {
        if (!Array.isArray(monsters)) {
            throw new Error(`Level ${id}: monsters must be an array`);
        }
        result.monsters = monsters.map((m, i) => parseMonsterSpawn(m, i, id));
    }

    if (dropSpawns !== undefined) {
        if (!Array.isArray(dropSpawns)) {
            throw new Error(`Level ${id}: dropSpawns must be an array`);
        }
        result.dropSpawns = dropSpawns.map((d, i) => parseDropSpawn(d, i, id));
    }

    return result;
}

function parsePoint(raw: unknown, label: string, idx: number, id: string): { x: number; y: number } {
    if (!Array.isArray(raw) || raw.length !== 2) {
        throw new Error(`Level ${id}: ${label}[${idx}].at must be [x, y]`);
    }
    const [x, y] = raw;
    if (typeof x !== 'number' || typeof y !== 'number') {
        throw new Error(`Level ${id}: ${label}[${idx}].at must be two numbers`);
    }
    return { x: Math.round(x), y: Math.round(y) };
}

function parseMonsterSpawn(raw: unknown, idx: number, id: string): MonsterSpawn {
    if (typeof raw !== 'object' || raw === null) {
        throw new Error(`Level ${id}: monsters[${idx}] must be an object`);
    }
    const m = raw as Record<string, unknown>;
    if (typeof m.type !== 'string' || m.type.length === 0) {
        throw new Error(`Level ${id}: monsters[${idx}].type must be a non-empty string`);
    }
    const at = parsePoint(m.at, 'monsters', idx, id);
    return { type: m.type, x: at.x, y: at.y };
}

function parseDropSpawn(raw: unknown, idx: number, id: string): DropSpawn {
    if (typeof raw !== 'object' || raw === null) {
        throw new Error(`Level ${id}: dropSpawns[${idx}] must be an object`);
    }
    const d = raw as Record<string, unknown>;
    if (typeof d.type !== 'string' || d.type.length === 0) {
        throw new Error(`Level ${id}: dropSpawns[${idx}].type must be a non-empty string`);
    }
    const at = parsePoint(d.at, 'dropSpawns', idx, id);
    return { type: d.type, x: at.x, y: at.y };
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