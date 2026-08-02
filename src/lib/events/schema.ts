/**
 * src/lib/events/schema.ts
 * --------------------------------------------------------------------------
 * Zod schemas for the events module.
 *
 * The event bus is a generic pub/sub — payloads are typed at the call
 * site (generic `Listener<T>`) but the bus itself doesn't validate
 * them. We use Zod schemas to document the event-name allowlist and
 * the intentionally-permissive payload shape.
 *
 * No runtime validation happens here today; if a future change adds a
 * cross-process event channel (IPC, postMessage), these become the
 * wire-level contract.
 */

import { z } from 'zod';

/**
 * Known editor / level event names. Loose enumeration — extend as new
 * events are added. The bus doesn't enforce this list at runtime
 * (`emit` accepts any string key); the schema just documents what's
 * in flight so a typo on either side is easier to spot.
 */
export const EventNameSchema = z.enum(['editor-open', 'level-loaded', 'current-scene-ready']);

/**
 * Event payloads are deliberately unconstrained — each emit/on pair
 * agrees on its own shape. The `unknown` schema documents that the
 * bus never validates payload internals.
 */
export const EventPayloadSchema = z.unknown();
