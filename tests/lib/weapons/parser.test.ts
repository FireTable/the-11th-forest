import { describe, it, expect } from 'vitest';

import { parseWeaponIndex, parseWeaponYaml } from '@/lib/weapons/parser';

describe('parseWeaponYaml', () => {
    const validYaml = `
name: Pistol
clipSize: 12
reloadTimeMs: 1200
fireIntervalMs: 200
bulletsPerShot: 1
bullet:
  speed: 20
  damage: 12
`;

    it('parses a minimal valid weapon', () => {
        const w = parseWeaponYaml(validYaml, 'pistol');
        expect(w).toEqual({
            id: 'pistol',
            name: 'Pistol',
            clipSize: 12,
            reloadTimeMs: 1200,
            fireIntervalMs: 200,
            bulletsPerShot: 1,
            bullet: { speed: 20, damage: 12 },
        });
    });

    it('accepts burst weapons (bulletsPerShot > 1)', () => {
        const yamlText = `
name: Shotgun
clipSize: 2
reloadTimeMs: 2400
fireIntervalMs: 800
bulletsPerShot: 5
bullet:
  speed: 22
  damage: 6
`;
        const w = parseWeaponYaml(yamlText, 'shotgun');
        expect(w.bulletsPerShot).toBe(5);
        expect(w.bullet).toEqual({ speed: 22, damage: 6 });
    });

    it('rejects negative or zero clipSize', () => {
        expect(() =>
            parseWeaponYaml(
                `${validYaml.replace('clipSize: 12', 'clipSize: 0')}`,
                'pistol',
            ),
        ).toThrow(/clipSize/);
        expect(() =>
            parseWeaponYaml(
                `${validYaml.replace('clipSize: 12', 'clipSize: -1')}`,
                'pistol',
            ),
        ).toThrow(/clipSize/);
    });

    it('rejects missing required bullet block', () => {
        const yamlText = `
name: Bad
clipSize: 12
reloadTimeMs: 1200
fireIntervalMs: 200
bulletsPerShot: 1
`;
        expect(() => parseWeaponYaml(yamlText, 'bad')).toThrow(/bullet/);
    });

    it('rejects bullet with zero damage or speed', () => {
        expect(() =>
            parseWeaponYaml(`${validYaml.replace('damage: 12', 'damage: 0')}`, 'pistol'),
        ).toThrow(/damage/);
        expect(() =>
            parseWeaponYaml(`${validYaml.replace('speed: 20', 'speed: 0')}`, 'pistol'),
        ).toThrow(/speed/);
    });

    it('rejects missing name', () => {
        expect(() =>
            parseWeaponYaml(`${validYaml.replace('name: Pistol', 'name: ""')}`, 'pistol'),
        ).toThrow(/name/);
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
