import { describe, it, expect } from 'vitest';

import { parseWeaponIndex, parseWeaponYaml } from '@/lib/weapons/parser';

describe('parseWeaponYaml — ranged', () => {
    const validYaml = `
name: Pistol
damage: 12
cooldownMs: 200
range: 600
clipSize: 12
reloadTimeMs: 1200
bulletsPerShot: 1
projectileSpeed: 20
`;

    it('parses a minimal valid ranged weapon', () => {
        const w = parseWeaponYaml(validYaml, 'pistol');
        expect(w).toEqual({
            id: 'pistol',
            name: 'Pistol',
            damage: 12,
            cooldownMs: 200,
            range: 600,
            clipSize: 12,
            reloadTimeMs: 1200,
            bulletsPerShot: 1,
            projectileSpeed: 20,
        });
    });

    it('accepts burst weapons (bulletsPerShot > 1)', () => {
        const yamlText = `
name: Shotgun
damage: 6
cooldownMs: 800
range: 400
clipSize: 2
reloadTimeMs: 2400
bulletsPerShot: 5
projectileSpeed: 22
`;
        const w = parseWeaponYaml(yamlText, 'shotgun');
        expect(w.bulletsPerShot).toBe(5);
        expect(w.projectileSpeed).toBe(22);
    });

    it('rejects negative or zero damage', () => {
        expect(() =>
            parseWeaponYaml(`${validYaml.replace('damage: 12', 'damage: 0')}`, 'pistol'),
        ).toThrow(/damage/);
        expect(() =>
            parseWeaponYaml(`${validYaml.replace('damage: 12', 'damage: -1')}`, 'pistol'),
        ).toThrow(/damage/);
    });

    it('rejects missing name', () => {
        expect(() =>
            parseWeaponYaml(`${validYaml.replace('name: Pistol', 'name: ""')}`, 'pistol'),
        ).toThrow(/name/);
    });
});

describe('parseWeaponYaml — melee', () => {
    const validYaml = `
name: Claws
damage: 8
cooldownMs: 1000
range: 36
hitWidth: 30
hitHeight: 30
`;

    it('parses a melee weapon', () => {
        const w = parseWeaponYaml(validYaml, 'claws');
        expect(w).toEqual({
            id: 'claws',
            name: 'Claws',
            damage: 8,
            cooldownMs: 1000,
            range: 36,
            hitWidth: 30,
            hitHeight: 30,
        });
    });
});

describe('parseWeaponYaml — kind validation', () => {
    it('rejects weapon with neither projectileSpeed nor hitWidth', () => {
        const yamlText = `
name: Bad
damage: 1
cooldownMs: 100
range: 100
`;
        expect(() => parseWeaponYaml(yamlText, 'bad')).toThrow(/ranged.*projectileSpeed.*melee.*hitWidth|projectileSpeed.*hitWidth/);
    });

    it('rejects weapon with both ranged and melee fields', () => {
        const yamlText = `
name: Bad
damage: 1
cooldownMs: 100
range: 100
projectileSpeed: 10
hitWidth: 30
hitHeight: 30
`;
        expect(() => parseWeaponYaml(yamlText, 'bad')).toThrow(/both or neither/);
    });
});

describe('parseWeaponIndex', () => {
    it('parses a single-entry manifest', () => {
        const idx = parseWeaponIndex('weapons:\n  - pistol\n');
        expect(idx.weapons).toEqual(['pistol']);
    });

    it('preserves order across multiple entries', () => {
        const idx = parseWeaponIndex(`
weapons:
  - pistol
  - shotgun
  - smg
`);
        expect(idx.weapons).toEqual(['pistol', 'shotgun', 'smg']);
    });

    it('rejects non-array `weapons`', () => {
        expect(() => parseWeaponIndex('weapons: 42')).toThrow(/array/);
    });

    it('rejects empty-id entries', () => {
        expect(() => parseWeaponIndex('weapons:\n  - ""\n')).toThrow(/non-empty string/);
    });
});
