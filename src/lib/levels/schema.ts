/**
 * src/lib/levels/schema.ts
 * --------------------------------------------------------------------------
 * Zod schema for the levels module.
 *
 * Legacy rect air walls (`x`/`y`/`width`/`height`) are still accepted
 * on input and migrated to 4-vertex polygons via `rectToPoints` —
 * older hand-drawn levels predate the polygon editor. Spawn points
 * use flat `{x, y}` (the earlier `at: [x, y]` form was removed when
 * every level YAML was rewritten).
 *
 * Single source of truth — `./types.ts` derives types via `z.infer`.
 */

import { z } from 'zod';

import { rectToPoints } from '@/lib/editor/polygon';

// ─── AirWall (polygon OR legacy rect) ────────────────────────────────────

const VertexSchema = z.tuple([z.number(), z.number()]);

const AirWallPolygonSchema = z
    .object({
        id: z.string().min(1),
        kind: z.enum(['tall', 'short']),
        points: z.array(VertexSchema).min(3),
    })
    .strict();

const AirWallRectSchema = z
    .object({
        id: z.string().min(1),
        kind: z.enum(['tall', 'short']),
        x: z.number(),
        y: z.number(),
        width: z.number().gt(0),
        height: z.number().gt(0),
    })
    .strict();

export const AirWallSchema = z.union([AirWallPolygonSchema, AirWallRectSchema]).transform((v) => {
    if ('points' in v) {
        return {
            id: v.id,
            kind: v.kind,
            points: v.points.map((p) => [Math.round(p[0]), Math.round(p[1])] as [number, number]),
        };
    }
    const rect = rectToPoints(v.x, v.y, v.width, v.height);
    return {
        id: v.id,
        kind: v.kind,
        points: rect.map((p) => [p.x, p.y] as [number, number]),
    };
});

// ─── Spawn entries (flat x, y only) ──────────────────────────────────────

export const CharacterSpawnSchema = z
    .object({
        facing: z.enum(['left', 'right']),
        x: z.number(),
        y: z.number(),
    })
    .strict()
    .transform((v) => ({ ...v, x: Math.round(v.x), y: Math.round(v.y) }));

/**
 * When a monster spawn is gated by a trigger instead of firing immediately
 * at level start. Pure data — runtime evaluation lives in
 * `src/game/monsters/monster.ts:advanceSpawnQueue`.
 *
 *   - `time`  fires at `levelStartElapsedMs + delayMs`.
 *   - `clear` fires once when no monster of the same `waveId` (or any
 *             monster, when `waveId` is omitted) is alive on the field,
 *             plus optional `delayMs` after that moment.
 *
 * `waveId` is optional on `MonsterSpawnSchema` itself so the same kind of
 * trigger can group multiple spawns into a "wave" that must all be cleared
 * before the next wave fires.
 */
export const MonsterTriggerSchema = z
    .object({
        kind: z.enum(['time', 'clear']),
        delayMs: z.number().gte(0).default(0),
        /** For `kind: 'clear'` — only this wave must be cleared. For
         *  `kind: 'time'` — tags which wave this spawn belongs to so
         *  subsequent `clear` triggers can wait on it. */
        waveId: z.string().min(1).optional(),
    })
    .strict();

export const MonsterSpawnSchema = z
    .object({
        type: z.string().min(1),
        x: z.number(),
        y: z.number(),
        trigger: MonsterTriggerSchema.optional(),
        /** Tag this spawn as part of a named wave so other triggers can
         *  wait on it via `trigger.waveId`. */
        waveId: z.string().min(1).optional(),
    })
    .strict()
    .transform((v) => ({ ...v, x: Math.round(v.x), y: Math.round(v.y) }));

export const DropSpawnSchema = z
    .object({
        type: z.string().min(1),
        x: z.number(),
        y: z.number(),
    })
    .strict()
    .transform((v) => ({ ...v, x: Math.round(v.x), y: Math.round(v.y) }));

// ─── PlacedMaterial ───────────────────────────────────────────────────────

export const PlacedMaterialSchema = z
    .object({
        id: z.string().min(1),
        texture: z.string().min(1),
        x: z.number(),
        y: z.number(),
        scale: z.number().gt(0).optional(),
        rotation: z.number().optional(),
        flipX: z.boolean().optional(),
        flipY: z.boolean().optional(),
        mode: z.enum(['background', 'y-sort', 'foreground']).optional(),
        depthOffset: z.number().optional(),
    })
    .strict()
    .transform((v) => ({
        ...v,
        x: Math.round(v.x),
        y: Math.round(v.y),
    }));

// ─── Level ────────────────────────────────────────────────────────────────

export const LevelSchema = z
    .object({
        title: z.string().min(1),
        background: z.string().min(1),
        imageSize: z.string().regex(/^\d+x\d+$/, 'expected "WxH"'),
        prompt: z.string().optional(),
        music: z.string().min(1).optional(),
        pixelLighting: z.boolean().optional(),
        airWalls: z.array(AirWallSchema),
        character: z.string().min(1).optional(),
        characterSpawn: CharacterSpawnSchema.optional(),
        monsters: z.array(MonsterSpawnSchema).optional(),
        dropSpawns: z.array(DropSpawnSchema).optional(),
        materials: z.array(PlacedMaterialSchema).optional(),
    })
    .strict()
    .transform((v) => {
        const [w, h] = v.imageSize.split('x');
        return {
            title: v.title,
            background: v.background,
            imageSize: { width: Number(w), height: Number(h) },
            airWalls: v.airWalls,
            ...(v.prompt !== undefined ? { prompt: v.prompt } : {}),
            ...(v.music !== undefined ? { music: v.music } : {}),
            ...(v.pixelLighting !== undefined ? { pixelLighting: v.pixelLighting } : {}),
            ...(v.character !== undefined ? { character: v.character } : {}),
            ...(v.characterSpawn !== undefined ? { characterSpawn: v.characterSpawn } : {}),
            ...(v.monsters !== undefined ? { monsters: v.monsters } : {}),
            ...(v.dropSpawns !== undefined ? { dropSpawns: v.dropSpawns } : {}),
            ...(v.materials !== undefined ? { materials: v.materials } : {}),
        };
    });

// ─── LevelIndex ───────────────────────────────────────────────────────────

export const LevelIndexSchema = z
    .object({
        levels: z.array(z.string().min(1)),
    })
    .strict();
