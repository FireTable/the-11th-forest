import { describe, it, expect } from 'vitest';

import { parseCharacterIndex, parseCharacterYaml } from '@/lib/characters/parser';

describe('parseCharacterYaml', () => {
    const validYaml = `
name: Wanderer
hp: 100
sp: 60
moveSpeed: 10
spRegenMs: 5000
body:
  halfW: 16
  halfH: 24
dodge:
  spCost: 15
  speed: 14
  durationMs: 220
  cooldownMs: 600
hotbar:
  - pistol
  - shotgun
  - smg
`;

    it('parses a minimal valid character', () => {
        const c = parseCharacterYaml(validYaml, 'wanderer');
        expect(c).toEqual({
            id: 'wanderer',
            name: 'Wanderer',
            hp: 100,
            sp: 60,
            moveSpeed: 10,
            spRegenMs: 5000,
            body: { halfW: 16, halfH: 24 },
            dodge: { spCost: 15, speed: 14, durationMs: 220, cooldownMs: 600 },
            hotbar: ['pistol', 'shotgun', 'smg'],
        });
    });

    it('rejects missing required fields', () => {
        expect(() => parseCharacterYaml('name: Wanderer\nhp: 100', 'w')).toThrow(/sp/);
    });

    it('rejects missing body', () => {
        expect(() =>
            parseCharacterYaml(
                validYaml.replace('body:\n  halfW: 16\n  halfH: 24\n', ''),
                'wanderer',
            ),
        ).toThrow(/body/);
    });

    it('rejects missing dodge', () => {
        expect(() =>
            parseCharacterYaml(
                validYaml.replace(
                    'dodge:\n  spCost: 15\n  speed: 14\n  durationMs: 220\n  cooldownMs: 600\n',
                    '',
                ),
                'wanderer',
            ),
        ).toThrow(/dodge/);
    });

    it('rejects missing hotbar', () => {
        expect(() =>
            parseCharacterYaml(
                validYaml.replace('hotbar:\n  - pistol\n  - shotgun\n  - smg\n', ''),
                'wanderer',
            ),
        ).toThrow(/hotbar/);
    });

    it('rejects empty hotbar', () => {
        expect(() =>
            parseCharacterYaml(
                validYaml.replace(
                    'hotbar:\n  - pistol\n  - shotgun\n  - smg\n',
                    'hotbar: []',
                ),
                'wanderer',
            ),
        ).toThrow(/hotbar/);
    });

    it('rejects hotbar with non-string entry', () => {
        expect(() =>
            parseCharacterYaml(
                validYaml.replace('  - pistol', '  - 42'),
                'wanderer',
            ),
        ).toThrow(/hotbar/);
    });

    it('rejects hotbar with empty-string entry', () => {
        expect(() =>
            parseCharacterYaml(
                validYaml.replace('  - pistol', '  - ""'),
                'wanderer',
            ),
        ).toThrow(/hotbar/);
    });

    it('rejects negative hp', () => {
        const yamlText = validYaml.replace('hp: 100', 'hp: -10');
        expect(() => parseCharacterYaml(yamlText, 'wanderer')).toThrow(/hp/);
    });

    it('rejects zero moveSpeed', () => {
        const yamlText = validYaml.replace('moveSpeed: 10', 'moveSpeed: 0');
        expect(() => parseCharacterYaml(yamlText, 'wanderer')).toThrow(/moveSpeed/);
    });

    it('accepts zero dodge.spCost (free dodges)', () => {
        const yamlText = validYaml.replace('spCost: 15', 'spCost: 0');
        const c = parseCharacterYaml(yamlText, 'wanderer');
        expect(c.dodge.spCost).toBe(0);
    });
});

describe('parseCharacterIndex', () => {
    it('parses a manifest', () => {
        const idx = parseCharacterIndex('characters:\n  - wanderer\n  - shadowcat\n');
        expect(idx.characters).toEqual(['wanderer', 'shadowcat']);
    });

    it('rejects non-array', () => {
        expect(() => parseCharacterIndex('characters: 7')).toThrow(/array/);
    });
});
