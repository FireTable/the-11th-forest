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
projectile:
  speed: 20
  visual:
    radius: 4
    width: 16
    height: 4
    color: 0x22c55e
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
            projectile: {
                speed: 20,
                visual: { radius: 4, width: 16, height: 4, color: 0x22c55e },
            },
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
projectile:
  speed: 22
  visual:
    radius: 4
    width: 16
    height: 4
    color: 0x22c55e
`;
        const w = parseWeaponYaml(yamlText, 'shotgun');
        expect(w.bulletsPerShot).toBe(5);
        expect(w.projectile?.speed).toBe(22);
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

    it('rejects ranged weapon missing projectile.visual.color', () => {
        const yamlText = validYaml.replace('color: 0x22c55e', 'color: ""');
        expect(() => parseWeaponYaml(yamlText, 'pistol')).toThrow(/projectile.visual.color/);
    });
});

describe('parseWeaponYaml — sfx', () => {
    it('accepts optional sfx block', () => {
        const w = parseWeaponYaml(
            `
name: Pistol
damage: 12
cooldownMs: 200
range: 600
projectile:
  speed: 20
  visual:
    radius: 4
    width: 16
    height: 4
    color: 0x22c55e
sfx:
  shoot: pistol-shoot
  reloadStart: pistol-reload
  reloadFinish: pistol-reload-finish
  dryFire: pistol-dry
  bulletWall: bullet-wall
`,
            'pistol',
        );
        expect(w.sfx).toEqual({
            shoot: 'pistol-shoot',
            reloadStart: 'pistol-reload',
            reloadFinish: 'pistol-reload-finish',
            dryFire: 'pistol-dry',
            bulletWall: 'bullet-wall',
        });
    });

    it('sfx is optional', () => {
        const w = parseWeaponYaml(
            `
name: Pistol
damage: 12
cooldownMs: 200
range: 600
projectile:
  speed: 20
  visual:
    radius: 4
    width: 16
    height: 4
    color: 0x22c55e
`,
            'pistol',
        );
        expect(w.sfx).toBeUndefined();
    });

    it('partial sfx block accepted (only shoot)', () => {
        const w = parseWeaponYaml(
            `
name: Pistol
damage: 12
cooldownMs: 200
range: 600
projectile:
  speed: 20
  visual:
    radius: 4
    width: 16
    height: 4
    color: 0x22c55e
sfx:
  shoot: pistol-shoot
`,
            'pistol',
        );
        expect(w.sfx?.shoot).toBe('pistol-shoot');
        expect(w.sfx?.reloadStart).toBeUndefined();
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
    it('rejects weapon with neither projectile nor hitWidth', () => {
        const yamlText = `
name: Bad
damage: 1
cooldownMs: 100
range: 100
`;
        expect(() => parseWeaponYaml(yamlText, 'bad')).toThrow(
            /ranged.*projectile.*melee.*hitWidth|projectile.*hitWidth/,
        );
    });

    it('rejects weapon with both ranged and melee fields', () => {
        const yamlText = `
name: Bad
damage: 1
cooldownMs: 100
range: 100
projectile:
  speed: 10
  visual:
    radius: 4
    width: 16
    height: 4
    color: 0x22c55e
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
        expect(() => parseWeaponIndex('weapons:\n  - ""\n')).toThrow(/Too small|>=1 characters/);
    });
});
