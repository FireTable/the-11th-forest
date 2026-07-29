/**
 * src/lib/levels/schema.ts
 * --------------------------------------------------------------------------
 * Zod schema for the levels module.
 *
 * Two legacy migrations baked in:
 *
 *   1. Legacy air walls (`x`/`y`/`width`/`height`) are accepted as
 *      alternate input — a `z.union` + `transform` rewrites them into
 *      4-vertex polygons via `rectToPoints`. The OUTPUT type only ever
 *      has `points`, never the legacy rect form.
 *
 *   2. Spawn-point coordinates are canonical `x` + `y` (flat) but
 *      `at: [x, y]` (legacy) is still accepted via a discriminated
 *      union — the parser normalises to flat `x`/`y` in the output.
 *
 * Single source of truth — `./types.ts` derives types via `z.infer`.
 */

import { z } from 'zod';

import { rectToPoints } from '@/lib/editor/polygon';

// ─── Spawn point (flat OR legacy `at: [x, y]`) ────────────────────────────
//
// Each spawn schema is a self-contained union of two object shapes,
// transformed to the canonical flat {x, y}. We can't use `.extend()`
// on a transformed schema (ZodPipe doesn't expose it), so each schema
// inlines its own union.

// ─── Spawn point (flat OR legacy `at: [x, y]`) ────────────────────────────
//
// Each spawn schema accepts EITHER flat {x, y} OR legacy {at: [x, y]} on
// input and normalizes to flat {x, y} on output. The legacy shape is
// tolerated so older level YAMLs keep loading.
//
// Implementation note: we can't easily get Zod 4 to infer the post-
// transform type from a union input (the spread collapses to {x, y}).
// So each spawn schema is written by hand instead of via a helper.

export const CharacterSpawnSchema = z
    .union([
        z
            .object({ facing: z.enum(['left', 'right']), x: z.number(), y: z.number() })
            .strict(),
        z
            .object({ facing: z.enum(['left', 'right']), at: z.tuple([z.number(), z.number()]) })
            .strict(),
    ])
    .transform((v) => {
        if ('at' in v) {
            const { at, ...rest } = v;
            return { ...rest, x: Math.round(at[0]), y: Math.round(at[1]) };
        }
        return { ...v, x: Math.round(v.x), y: Math.round(v.y) };
    });

export const MonsterSpawnSchema = z
    .union([
        z.object({ type: z.string().min(1), x: z.number(), y: z.number() }).strict(),
        z.object({ type: z.string().min(1), at: z.tuple([z.number(), z.number()]) }).strict(),
    ])
    .transform((v) => {
        if ('at' in v) {
            const { at, ...rest } = v;
            return { ...rest, x: Math.round(at[0]), y: Math.round(at[1]) };
        }
        return { ...v, x: Math.round(v.x), y: Math.round(v.y) };
    });

export const DropSpawnSchema = z
    .union([
        z.object({ type: z.string().min(1), x: z.number(), y: z.number() }).strict(),
        z.object({ type: z.string().min(1), at: z.tuple([z.number(), z.number()]) }).strict(),
    ])
    .transform((v) => {
        if ('at' in v) {
            const { at, ...rest } = v;
            return { ...rest, x: Math.round(at[0]), y: Math.round(at[1]) };
        }
        return { ...v, x: Math.round(v.x), y: Math.round(v.y) };
    });

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

export const AirWallSchema = z
    .union([AirWallPolygonSchema, AirWallRectSchema])
    .transform((v) => {
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

// ─── Spawn entries ────────────────────────────────────────────────────────

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
        const result = {
            title: v.title,
            background: v.background,
            imageSize: { width: Number(w), height: Number(h) },
            airWalls: v.airWalls,
            ...(v.prompt !== undefined ? { prompt: v.prompt } : {}),
            ...(v.character !== undefined ? { character: v.character } : {}),
            ...(v.characterSpawn !== undefined ? { characterSpawn: v.characterSpawn } : {}),
            ...(v.monsters !== undefined ? { monsters: v.monsters } : {}),
            ...(v.dropSpawns !== undefined ? { dropSpawns: v.dropSpawns } : {}),
            ...(v.materials !== undefined ? { materials: v.materials } : {}),
        };
        return result;
    });

// ─── LevelIndex ───────────────────────────────────────────────────────────

export const LevelIndexSchema = z
    .object({
        levels: z.array(z.string().min(1)),
    })
    .strict();