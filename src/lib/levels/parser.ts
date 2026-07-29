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
    type CharacterSpawn,
    type DropSpawn,
    type Level,
    type LevelIndex,
    type MonsterSpawn,
    type PlacedMaterial,
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
 *   monsters:   [{ type: id, x, y }, ...]
 *   dropSpawns: [{ type: id, x, y }, ...]
 *
 * Missing fields are simply absent — no default monster spawns unless listed.
 */
export function parseLevelYaml(text: string, id: string): Level {
    const raw = parseYaml(text) as Record<string, unknown> | null;
    if (raw === null || typeof raw !== 'object') {
        throw new Error(`Level ${id}: empty or non-object YAML`);
    }

    const { title, background, imageSize, prompt, airWalls, character, characterSpawn, monsters, dropSpawns, materials } =
        raw;
    if (typeof title !== 'string' || title.length === 0) throw new Error(`Level ${id}: title required`);
    if (typeof background !== 'string' || background.length === 0) throw new Error(`Level ${id}: background required`);
    if (typeof imageSize !== 'string') throw new Error(`Level ${id}: imageSize required (string "WxH")`);

    const size = parseImageSize(imageSize);
    const walls = Array.isArray(airWalls) ? airWalls.map((w, i) => parseAirWall(w, i)) : [];

    const result: Level = {
        title,
        background,
        imageSize: size,
        airWalls: walls,
    };
    if (typeof prompt === 'string') {
        result.prompt = prompt;
    }

    if (character !== undefined) {
        if (typeof character !== 'string' || character.length === 0) {
            throw new Error(`Level ${id}: character must be a non-empty string`);
        }
        result.character = character;
    }

    if (characterSpawn !== undefined) {
        result.characterSpawn = parseCharacterSpawn(characterSpawn, id);
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

    if (materials !== undefined) {
        if (!Array.isArray(materials)) {
            throw new Error(`Level ${id}: materials must be an array`);
        }
        result.materials = materials.map((m, i) => parsePlacedMaterial(m, i, id));
    }

    return result;
}

function parsePlacedMaterial(raw: unknown, idx: number, id: string): PlacedMaterial {
    if (typeof raw !== 'object' || raw === null) {
        throw new Error(`Level ${id}: materials[${idx}] must be an object`);
    }
    const m = raw as Record<string, unknown>;
    if (typeof m.id !== 'string' || m.id.length === 0) {
        throw new Error(`Level ${id}: materials[${idx}].id must be a non-empty string`);
    }
    if (typeof m.texture !== 'string' || m.texture.length === 0) {
        throw new Error(`Level ${id}: materials[${idx}].texture must be a non-empty string`);
    }
    if (typeof m.x !== 'number' || !Number.isFinite(m.x) || typeof m.y !== 'number' || !Number.isFinite(m.y)) {
        throw new Error(`Level ${id}: materials[${idx}].x and y must be finite numbers`);
    }
    const res: PlacedMaterial = {
        id: m.id,
        texture: m.texture,
        x: Math.round(m.x),
        y: Math.round(m.y),
    };
    if (typeof m.scale === 'number' && Number.isFinite(m.scale) && m.scale > 0) {
        res.scale = m.scale;
    }
    if (typeof m.rotation === 'number' && Number.isFinite(m.rotation)) {
        res.rotation = m.rotation;
    }
    if (typeof m.flipX === 'boolean') {
        res.flipX = m.flipX;
    }
    if (typeof m.flipY === 'boolean') {
        res.flipY = m.flipY;
    }
    if (m.mode === 'background' || m.mode === 'y-sort' || m.mode === 'foreground') {
        res.mode = m.mode;
    }
    if (typeof m.depthOffset === 'number' && Number.isFinite(m.depthOffset)) {
        res.depthOffset = m.depthOffset;
    }
    return res;
}

function parsePoint(obj: Record<string, unknown>, label: string, idx: number, id: string): { x: number; y: number } {
    if (typeof obj.x === 'number' && Number.isFinite(obj.x) && typeof obj.y === 'number' && Number.isFinite(obj.y)) {
        return { x: Math.round(obj.x), y: Math.round(obj.y) };
    }
    // Backward compatibility for legacy `at: [x, y]`
    if (Array.isArray(obj.at) && obj.at.length === 2 && typeof obj.at[0] === 'number' && typeof obj.at[1] === 'number') {
        return { x: Math.round(obj.at[0]), y: Math.round(obj.at[1]) };
    }
    throw new Error(`Level ${id}: ${label}${idx >= 0 ? `[${idx}]` : ''} must specify numbers x and y`);
}

function parseMonsterSpawn(raw: unknown, idx: number, id: string): MonsterSpawn {
    if (typeof raw !== 'object' || raw === null) {
        throw new Error(`Level ${id}: monsters[${idx}] must be an object`);
    }
    const m = raw as Record<string, unknown>;
    if (typeof m.type !== 'string' || m.type.length === 0) {
        throw new Error(`Level ${id}: monsters[${idx}].type must be a non-empty string`);
    }
    const point = parsePoint(m, 'monsters', idx, id);
    return { type: m.type, x: point.x, y: point.y };
}

function parseDropSpawn(raw: unknown, idx: number, id: string): DropSpawn {
    if (typeof raw !== 'object' || raw === null) {
        throw new Error(`Level ${id}: dropSpawns[${idx}] must be an object`);
    }
    const d = raw as Record<string, unknown>;
    if (typeof d.type !== 'string' || d.type.length === 0) {
        throw new Error(`Level ${id}: dropSpawns[${idx}].type must be a non-empty string`);
    }
    const point = parsePoint(d, 'dropSpawns', idx, id);
    return { type: d.type, x: point.x, y: point.y };
}

function parseCharacterSpawn(raw: unknown, id: string): CharacterSpawn {
    if (typeof raw !== 'object' || raw === null) {
        throw new Error(`Level ${id}: characterSpawn must be an object`);
    }
    const s = raw as Record<string, unknown>;
    const point = parsePoint(s, 'characterSpawn', -1, id);
    if (s.facing !== 'left' && s.facing !== 'right') {
        throw new Error(
            `Level ${id}: characterSpawn.facing must be 'left' or 'right', got ${JSON.stringify(s.facing)}`,
        );
    }
    return { x: point.x, y: point.y, facing: s.facing };
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