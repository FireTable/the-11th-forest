/**
 * src/lib/drops/index.ts
 * --------------------------------------------------------------------------
 * Public API for the drops module.
 */

export type { DropEffect, DropIndex, DropKind, DropSpec, DropType } from './types';
export { parseDropIndex, parseDropYaml } from './parser';
export { fetchDrop, fetchDropIndex } from './loader';
