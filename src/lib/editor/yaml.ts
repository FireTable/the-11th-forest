/**
 * src/lib/editor/yaml.ts
 * --------------------------------------------------------------------------
 * Serialize a Level back to YAML. Symmetric counterpart of
 * src/lib/levels/parser.ts — what you save should round-trip through parse.
 *
 * Pure / sync, no I/O. Used by the Vite editor middleware to write
 * public/data/levels/<id>.yaml.
 */

import { dump as stringifyYaml } from 'js-yaml';

import { formatImageSize, type Level } from '@/lib/levels/types';

export function serializeLevelYaml(level: Level): string {
    // Dump every Level field — the editor only edits airWalls, but
    // character / characterSpawn / monsters / dropSpawns must survive
    // a save. Skipping them here used to silently wipe them on save.
    //
    // Each field is mapped explicitly to its YAML shape:
    //   - imageSize       → "WxH" string
    //   - characterSpawn  → { at: [x, y], facing } (parser expects at)
    //   - monsters        → [{ type, at: [x, y] }, ...] (same as parser)
    //   - dropSpawns      → [{ type, at: [x, y] }, ...] (same as parser)
    //
    // Re-emitting monsters/dropSpawns as `at: [x, y]` (not flat `x/y`)
    // keeps round-tripping through the parser and avoids js-yaml quoting
    // `y`/`n` keys (YAML 1.1 booleans).
    //
    // Undefined optional fields are dropped so the YAML stays minimal.
    const payload: Record<string, unknown> = {
        title: level.title,
        background: level.background,
        imageSize: formatImageSize(level.imageSize),
        prompt: level.prompt,
        airWalls: level.airWalls,
    };
    if (level.character !== undefined) payload.character = level.character;
    if (level.characterSpawn !== undefined) {
        payload.characterSpawn = {
            at: [level.characterSpawn.x, level.characterSpawn.y],
            facing: level.characterSpawn.facing,
        };
    }
    if (level.monsters !== undefined) {
        payload.monsters = level.monsters.map((m) => ({
            type: m.type,
            at: [m.x, m.y],
        }));
    }
    if (level.dropSpawns !== undefined) {
        payload.dropSpawns = level.dropSpawns.map((d) => ({
            type: d.type,
            at: [d.x, d.y],
        }));
    }
    if (level.materials !== undefined) {
        payload.materials = level.materials;
    }
    return stringifyYaml(payload, {
        lineWidth: -1,
        sortKeys: false,
        noRefs: true,
    });
}