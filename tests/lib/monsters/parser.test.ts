import { describe, it, expect } from 'vitest';

import { parseMonsterIndex, parseMonsterYaml } from '@/lib/monsters/parser';

describe('parseMonsterYaml — melee', () => {
    const validYaml = `
name: Drone
hp: 30
moveSpeed: 4
kind: melee
attackRange: 36
attackIntervalMs: 1000
contactDamage: 8
drops:
  - dropId: hp-shard
    chance: 0.4
`;

    it('parses a melee monster', () => {
        const m = parseMonsterYaml(validYaml, 'drone');
        expect(m).toEqual({
            id: 'drone',
            name: 'Drone',
            hp: 30,
            moveSpeed: 4,
            kind: 'melee',
            attackRange: 36,
            attackIntervalMs: 1000,
            contactDamage: 8,
            drops: [{ dropId: 'hp-shard', chance: 0.4 }],
        });
    });

    it('rejects melee missing contactDamage', () => {
        // Missing field → undefined → throws
        expect(() => parseMonsterYaml(`
name: D
hp: 1
moveSpeed: 1
kind: melee
attackRange: 1
attackIntervalMs: 1
`, 'd')).toThrow(/contactDamage/);
        // Zero is not positive → throws
        const zeroed = validYaml.replace('contactDamage: 8', 'contactDamage: 0');
        expect(() => parseMonsterYaml(zeroed, 'drone')).toThrow(/contactDamage/);
    });
});

describe('parseMonsterYaml — ranged', () => {
    const validYaml = `
name: Gunner
hp: 20
moveSpeed: 3
kind: ranged
attackRange: 200
attackIntervalMs: 1500
projectile:
  speed: 14
  damage: 6
drops: []
`;

    it('parses a ranged monster', () => {
        const m = parseMonsterYaml(validYaml, 'gunner');
        expect(m.kind).toBe('ranged');
        expect(m.projectile).toEqual({ speed: 14, damage: 6 });
        expect(m.drops).toEqual([]);
    });

    it('rejects ranged missing projectile', () => {
        // Missing field → undefined → throws
        expect(() => parseMonsterYaml(`
name: G
hp: 1
moveSpeed: 1
kind: ranged
attackRange: 1
attackIntervalMs: 1
`, 'g')).toThrow(/projectile/);
    });
});

describe('parseMonsterYaml — common', () => {
    const validYaml = `
name: Drone
hp: 30
moveSpeed: 4
kind: melee
attackRange: 36
attackIntervalMs: 1000
contactDamage: 8
drops: []
`;

    it('rejects unknown kind', () => {
        const yamlText = validYaml.replace('kind: melee', 'kind: invisible');
        expect(() => parseMonsterYaml(yamlText, 'drone')).toThrow(/kind/);
    });

    it('rejects drop chance outside [0, 1]', () => {
        expect(() =>
            parseMonsterYaml(
                `${validYaml.replace(
                    'drops: []',
                    'drops:\n  - dropId: a\n    chance: 1.5',
                )}`,
                'drone',
            ),
        ).toThrow(/chance/);
    });

    it('accepts drops: [] (no drops)', () => {
        const m = parseMonsterYaml(validYaml, 'drone');
        expect(m.drops).toEqual([]);
    });

    it('accepts drops omitted (defaults to empty)', () => {
        const yamlText = validYaml.replace('drops: []', '');
        const m = parseMonsterYaml(yamlText, 'drone');
        expect(m.drops).toEqual([]);
    });
});

describe('parseMonsterIndex', () => {
    it('parses a manifest', () => {
        const idx = parseMonsterIndex('monsters:\n  - drone\n  - gunner\n');
        expect(idx.monsters).toEqual(['drone', 'gunner']);
    });

    it('rejects non-array', () => {
        expect(() => parseMonsterIndex('monsters: 5')).toThrow(/array/);
    });
});
