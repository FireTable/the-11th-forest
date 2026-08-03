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
    //   - characterSpawn  → { x, y, facing }
    //   - monsters        → [{ type, x, y }, ...]
    //   - dropSpawns      → [{ type, x, y }, ...]
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
            x: level.characterSpawn.x,
            y: level.characterSpawn.y,
            facing: level.characterSpawn.facing,
        };
    }
    if (level.monsters !== undefined) {
        payload.monsters = level.monsters.map((m) => ({
            type: m.type,
            x: m.x,
            y: m.y,
        }));
    }
    if (level.dropSpawns !== undefined) {
        payload.dropSpawns = level.dropSpawns.map((d) => ({
            type: d.type,
            x: d.x,
            y: d.y,
        }));
    }
    if (level.materials !== undefined) {
        payload.materials = level.materials;
    }
    if (level.teleporters !== undefined) {
        payload.teleporters = level.teleporters;
    }
    return stringifyYaml(payload, {
        lineWidth: -1,
        sortKeys: false,
        noRefs: true,
    });
}
