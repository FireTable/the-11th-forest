/**
 * src/lib/levels/prefetch.ts
 * --------------------------------------------------------------------------
 * Pre-fetch planning: given a Level + the monster specs it references,
 * compute every drop id the runtime will need to look up. Used by
 * main.ts before constructing the Phaser scene so that monster-death
 * rolls (`rollDrops`) and static pickups both have their specs in hand.
 *
 * Without this, a monster dying would throw "Unknown drop id" because
 * its drop table references ids that were never loaded.
 */

import type { Level } from './types';
import type { MonsterSpec } from '@/lib/monsters';

export function collectDropIds(level: Level, monsterSpecs: Map<string, MonsterSpec>): Set<string> {
    const ids = new Set<string>();
    level.dropSpawns?.forEach((d) => ids.add(d.type));
    monsterSpecs.forEach((spec) => {
        for (const ref of spec.drops ?? []) ids.add(ref.dropId);
    });
    return ids;
}
