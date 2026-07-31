/**
 * src/lib/levels/types.ts
 * --------------------------------------------------------------------------
 * Runtime level data types. Matches the schema in data/levels/*.yaml.
 * Filename (sans .yaml) is the canonical scene id; do NOT add an `id`
 * field to the data — derive from the file.
 *
 * Two kinds of air wall:
 *   tall   — solid: blocks character AND bullets (red)
 *   short  — half: blocks character only, bullets pass over (blue)
 *
 * Types are derived from `./schema.ts` via `z.infer` — single source
 * of truth shared with runtime validation. Legacy rect air walls are
 * migrated by the schema; the OUTPUT type only ever carries `points`.
 */

import type { z } from 'zod';

import type {
    AirWallSchema,
    CharacterSpawnSchema,
    DropSpawnSchema,
    LevelIndexSchema,
    LevelSchema,
    MonsterSpawnSchema,
    MonsterTriggerSchema,
    PlacedMaterialSchema,
} from './schema';

export type AirWallKind = 'tall' | 'short';

export type AirWallVertex = [number, number];

export type AirWall = z.infer<typeof AirWallSchema>;

export type ImageSize = {
    width: number;
    height: number;
};

export type MaterialMode = 'background' | 'y-sort' | 'foreground';

export type PlacedMaterial = z.infer<typeof PlacedMaterialSchema>;

export type Level = z.infer<typeof LevelSchema>;

export type SpawnPoint = {
    x: number;
    y: number;
};

/** Where + which way the player character spawns. Defaults to image center,
 *  facing right (matches the wanderer sprite's natural direction). */
export type CharacterSpawn = z.infer<typeof CharacterSpawnSchema>;

export type MonsterSpawn = z.infer<typeof MonsterSpawnSchema>;

/** Trigger gating a monster spawn — see `MonsterTriggerSchema`. */
export type MonsterTrigger = z.infer<typeof MonsterTriggerSchema>;

export type DropSpawn = z.infer<typeof DropSpawnSchema>;

/**
 * Ordered manifest of all levels. Each entry is a scene id (= filename
 * basename). Loader enforces: every id here must have a matching
 * data/levels/<id>.yaml file. Orphan files are allowed (drafts).
 */
export type LevelIndex = z.infer<typeof LevelIndexSchema>;

/**
 * Parse `WxH` (e.g. `2752x1536`) into an ImageSize. Throws on bad input.
 */
export function parseImageSize(s: string): ImageSize {
    const m = s.match(/^(\d+)x(\d+)$/);
    if (!m) throw new Error(`Invalid imageSize: ${JSON.stringify(s)} (expected "WxH")`);
    return { width: Number(m[1]), height: Number(m[2]) };
}

/** Serialize ImageSize back to `WxH`. */
export function formatImageSize(size: ImageSize): string {
    return `${size.width}x${size.height}`;
}