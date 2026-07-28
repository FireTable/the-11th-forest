import { describe, it, expect } from 'vitest';

import { parseCharacterIndex, parseCharacterYaml } from '@/lib/characters/parser';

describe('parseCharacterYaml', () => {
    const validYaml = `
name: Wanderer
hp: 100
sp: 60
moveSpeed: 10
dodgeSpCost: 15
spRegenMs: 5000
`;

    it('parses a minimal valid character', () => {
        const c = parseCharacterYaml(validYaml, 'wanderer');
        expect(c).toEqual({
            id: 'wanderer',
            name: 'Wanderer',
            hp: 100,
            sp: 60,
            moveSpeed: 10,
            dodgeSpCost: 15,
            spRegenMs: 5000,
        });
    });

    it('rejects missing required fields', () => {
        expect(() => parseCharacterYaml('name: Wanderer\nhp: 100', 'w')).toThrow(/sp/);
    });

    it('rejects negative hp', () => {
        const yamlText = validYaml.replace('hp: 100', 'hp: -10');
        expect(() => parseCharacterYaml(yamlText, 'w')).toThrow(/hp/);
    });

    it('rejects zero moveSpeed', () => {
        const yamlText = validYaml.replace('moveSpeed: 10', 'moveSpeed: 0');
        expect(() => parseCharacterYaml(yamlText, 'w')).toThrow(/moveSpeed/);
    });

    it('accepts zero dodgeSpCost (free dodges)', () => {
        const yamlText = validYaml.replace('dodgeSpCost: 15', 'dodgeSpCost: 0');
        const c = parseCharacterYaml(yamlText, 'w');
        expect(c.dodgeSpCost).toBe(0);
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
