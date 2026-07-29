import { describe, it, expect } from 'vitest';

import { collectDropIds } from '@/lib/levels/prefetch';
import type { Level } from '@/lib/levels';
import type { MonsterSpec } from '@/lib/monsters';

function level(partial: Partial<Level> = {}): Level {
    return {
        title: 't',
        background: 'a.png',
        imageSize: { width: 1, height: 1 },
        airWalls: [],
        ...partial,
    };
}

describe('collectDropIds', () => {
    it('returns only static dropSpawns when no monsters', () => {
        const ids = collectDropIds(
            level({ dropSpawns: [{ type: 'hp-shard', x: 1, y: 2 }] }),
            new Map(),
        );
        expect(ids).toEqual(new Set(['hp-shard']));
    });

    it('collects monster death drops from every spec referenced', () => {
        const monsters = new Map<string, MonsterSpec>([
            [
                'drone',
                {
                    id: 'drone',
                    name: 'Drone',
                    hp: 30,
                    moveSpeed: 4,
                    body: { halfW: 14, halfH: 14 },
                    weaponId: 'drone-claws',
                    drops: [{ dropId: 'hp-shard', chance: 0.4 }],
                },
            ],
            [
                'gunner',
                {
                    id: 'gunner',
                    name: 'Gunner',
                    hp: 20,
                    moveSpeed: 3,
                    body: { halfW: 14, halfH: 14 },
                    weaponId: 'gunner-blast',
                    drops: [{ dropId: 'ammo-cache', chance: 0.5 }],
                },
            ],
        ]);
        const ids = collectDropIds(level(), monsters);
        expect(ids).toEqual(new Set(['hp-shard', 'ammo-cache']));
    });

    it('unions static + monster drops without duplicates', () => {
        const monsters = new Map<string, MonsterSpec>([
            [
                'drone',
                {
                    id: 'drone',
                    name: 'Drone',
                    hp: 30,
                    moveSpeed: 4,
                    body: { halfW: 14, halfH: 14 },
                    weaponId: 'drone-claws',
                    drops: [{ dropId: 'hp-shard', chance: 1 }],
                },
            ],
        ]);
        const ids = collectDropIds(
            level({ dropSpawns: [{ type: 'hp-shard', x: 0, y: 0 }] }),
            monsters,
        );
        expect(ids).toEqual(new Set(['hp-shard']));
    });

    it('returns empty set when neither field is set', () => {
        const ids = collectDropIds(level(), new Map());
        expect(ids.size).toBe(0);
    });

    it('ignores monsters whose spec has no drops', () => {
        const monsters = new Map<string, MonsterSpec>([
            [
                'empty',
                {
                    id: 'empty',
                    name: 'Empty',
                    hp: 10,
                    moveSpeed: 1,
                    body: { halfW: 14, halfH: 14 },
                    weaponId: 'claw',
                    drops: [],
                },
            ],
        ]);
        const ids = collectDropIds(level(), monsters);
        expect(ids.size).toBe(0);
    });
});