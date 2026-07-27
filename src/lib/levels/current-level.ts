/**
 * src/lib/levels/current-level.ts
 * --------------------------------------------------------------------------
 * Module-level cache of the level most recently loaded by the Phaser scene.
 *
 * Exists so the editor panel (which lives in a lazy chunk and may mount
 * AFTER the scene has already fired `level-loaded`) can pick up the
 * current level instead of waiting for the next one. Lives in `src/lib/`
 * because both the scene (writes) and the panel (reads) depend on it.
 */

import type { Level } from './types';

export interface CurrentLevel {
    id: string;
    level: Level;
}

let current: CurrentLevel | null = null;

export function setCurrentLevel(payload: CurrentLevel | null): void {
    current = payload;
}

export function getCurrentLevel(): CurrentLevel | null {
    return current;
}