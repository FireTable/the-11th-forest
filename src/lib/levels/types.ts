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
 * AirWall stores a polygon as a list of [x, y] vertices in image pixel
 * space. The polygon is implicitly closed (last vertex connects to the
 * first). A rectangle is just a 4-vertex polygon. The parser also
 * accepts the legacy `x/y/width/height` form and migrates it.
 */
export type AirWallKind = 'tall' | 'short';

export type AirWallVertex = [number, number];

export type AirWall = {
    id: string;
    kind: AirWallKind;
    /** Vertex list, [x, y] pairs in image pixel space. Implicitly closed. */
    points: AirWallVertex[];
};

export type ImageSize = {
    width: number;
    height: number;
};

export type Level = {
    title: string;
    // Background asset path (relative to public/, resolved by the loader).
    background: string;
    // Native pixel dimensions of the background image.
    imageSize: ImageSize;
    // Pointer to the matching prompts/scenes/<id>.yaml. Same basename
    // by convention; the loader asserts imageSize equality across both.
    promptFile: string;
    airWalls: AirWall[];
    // Optional: spawn config for entities (Phase 1+). Each field references
    // a separate /data/<thing>/<id>.yaml by id; missing fields default sensibly.
    character?: string; // character id from /data/characters/
    monsters?: MonsterSpawn[];
    dropSpawns?: DropSpawn[];
};

export type SpawnPoint = {
    x: number;
    y: number;
};

export type MonsterSpawn = SpawnPoint & {
    type: string; // monster id from /data/monsters/
};

export type DropSpawn = SpawnPoint & {
    type: string; // drop id from /data/drops/
};

/**
 * Ordered manifest of all levels. Each entry is a scene id (= filename
 * basename). Loader enforces: every id here must have a matching
 * data/levels/<id>.yaml file. Orphan files are allowed (drafts).
 */
export type LevelIndex = {
    levels: string[];
};

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