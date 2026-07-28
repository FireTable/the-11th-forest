import { describe, it, expect } from 'vitest';

import { parseMonsterIndex, parseMonsterYaml } from '@/lib/monsters/parser';

describe('parseMonsterYaml', () => {
    const meleeYaml = `
name: Drone
hp: 30
moveSpeed: 4
weaponId: drone-claws
drops:
  - dropId: hp-shard
    chance: 0.4
`;

    it('parses a melee monster (with weapon reference)', () => {
        const m = parseMonsterYaml(meleeYaml, 'drone');
        expect(m.id).toBe('drone');
        expect(m.name).toBe('Drone');
        expect(m.hp).toBe(30);
        expect(m.moveSpeed).toBe(4);
        expect(m.weaponId).toBe('drone-claws');
        expect(m.drops).toEqual([{ dropId: 'hp-shard', chance: 0.4 }]);
    });

    it('parses a ranged monster (weapon references ranged weapon)', () => {
        const yamlText = `
name: Gunner
hp: 20
moveSpeed: 3
weaponId: gunner-blast
drops: []
`;
        const m = parseMonsterYaml(yamlText, 'gunner');
        expect(m.weaponId).toBe('gunner-blast');
        expect(m.drops).toEqual([]);
    });

    it('requires weaponId', () => {
        const yamlText = `
name: Bad
hp: 1
moveSpeed: 1
drops: []
`;
        expect(() => parseMonsterYaml(yamlText, 'bad')).toThrow(/weaponId/);
    });

    it('rejects non-positive moveSpeed', () => {
        expect(() =>
            parseMonsterYaml(
                `${meleeYaml.replace('moveSpeed: 4', 'moveSpeed: 0')}`,
                'drone',
            ),
        ).toThrow(/moveSpeed/);
    });

    it('rejects drop chance outside [0, 1]', () => {
        expect(() =>
            parseMonsterYaml(
                `${meleeYaml.replace('chance: 0.4', 'chance: 1.5')}`,
                'drone',
            ),
        ).toThrow(/chance/);
    });

    it('accepts drops omitted (defaults to empty)', () => {
        const yamlText = `
name: Drone
hp: 30
moveSpeed: 4
weaponId: drone-claws
`;
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
