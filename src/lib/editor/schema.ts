/**
 * src/lib/editor/schema.ts
 * --------------------------------------------------------------------------
 * Zod schemas for data shapes that flow through the editor module.
 *
 * The editor module doesn't load external data directly — it mutates a
 * `Level` produced by `lib/levels` (already schema'd). These schemas
 * cover the SHAPES that get passed across editor functions (vertex
 * tuples, kind enum, bounding box) so they're documented in one place
 * and can be reused if any of these ever cross a trust boundary
 * (e.g. an editor IPC channel, a clipboard payload, …).
 */

import { z } from 'zod';

export const AirWallVertexSchema = z.tuple([z.number(), z.number()]);

export const AirWallKindSchema = z.enum(['tall', 'short']);

export const BoundingBoxSchema = z.object({
    x: z.number(),
    y: z.number(),
    width: z.number().gte(0),
    height: z.number().gte(0),
});

/** A single editor mutation request — used by the wall-canvas panel. */
export const WallMutationSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('add'), wallId: z.string().min(1), vertex: AirWallVertexSchema }),
    z.object({ kind: z.literal('move'), wallId: z.string().min(1), index: z.number().int().gte(0), x: z.number(), y: z.number() }),
    z.object({ kind: z.literal('remove'), wallId: z.string().min(1), index: z.number().int().gte(0) }),
    z.object({ kind: z.literal('move-polygon'), wallId: z.string().min(1), dx: z.number(), dy: z.number() }),
    z.object({ kind: z.literal('set-kind'), wallId: z.string().min(1), wallKind: AirWallKindSchema }),
    z.object({ kind: z.literal('delete'), wallId: z.string().min(1) }),
]);