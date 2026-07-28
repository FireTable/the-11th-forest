import { describe, it, expect } from 'vitest';

import { parseDropIndex, parseDropYaml } from '@/lib/drops/parser';

describe('parseDropYaml — instant', () => {
    it('parses an HP instant drop', () => {
        const d = parseDropYaml(
            `
name: HP Shard
kind: static
effect:
  type: instant
  hp: 25
`,
            'hp-shard',
        );
        expect(d.effect).toEqual({ type: 'instant', hp: 25, sp: 0 });
    });

    it('parses an SP instant drop', () => {
        const d = parseDropYaml(
            `
name: SP Fragment
kind: static
effect:
  type: instant
  sp: 20
`,
            'sp-frag',
        );
        expect(d.effect).toEqual({ type: 'instant', hp: 0, sp: 20 });
    });

    it('rejects instant with neither hp nor sp', () => {
        expect(() =>
            parseDropYaml(
                `
name: Bad
kind: static
effect:
  type: instant
`,
                'bad',
            ),
        ).toThrow(/instant effect needs/);
    });
});

describe('parseDropYaml — refill-ammo', () => {
    it('parses a refill-ammo drop', () => {
        const d = parseDropYaml(
            `
name: Ammo Cache
kind: static
effect:
  type: refill-ammo
  ammoFraction: 0.3
`,
            'ammo-cache',
        );
        expect(d.effect).toEqual({ type: 'refill-ammo', ammoFraction: 0.3 });
    });

    it('rejects ammoFraction out of (0, 1]', () => {
        expect(() =>
            parseDropYaml(
                `
name: Bad
kind: static
effect:
  type: refill-ammo
  ammoFraction: 1.5
`,
                'bad',
            ),
        ).toThrow(/ammoFraction/);
        expect(() =>
            parseDropYaml(
                `
name: Bad
kind: static
effect:
  type: refill-ammo
  ammoFraction: 0
`,
                'bad',
            ),
        ).toThrow(/ammoFraction/);
    });
});

describe('parseDropYaml — weapon', () => {
    it('parses a weapon drop', () => {
        const d = parseDropYaml(
            `
name: Pistol Pickup
kind: static
effect:
  type: weapon
  weaponId: pistol
`,
            'weapon-pistol',
        );
        expect(d.effect).toEqual({ type: 'weapon', weaponId: 'pistol' });
    });

    it('rejects weapon missing weaponId', () => {
        expect(() =>
            parseDropYaml(
                `
name: Bad
kind: static
effect:
  type: weapon
`,
                'bad',
            ),
        ).toThrow(/weaponId/);
    });
});

describe('parseDropYaml — common', () => {
    it('rejects unknown kind', () => {
        expect(() =>
            parseDropYaml(
                `
name: x
kind: floating
effect:
  type: instant
  hp: 1
`,
                'x',
            ),
        ).toThrow(/kind/);
    });

    it('rejects unknown effect type', () => {
        expect(() =>
            parseDropYaml(
                `
name: x
kind: static
effect:
  type: explode
`,
                'x',
            ),
        ).toThrow(/effect.type/);
    });
});

describe('parseDropIndex', () => {
    it('parses a manifest', () => {
        const idx = parseDropIndex('drops:\n  - hp-shard\n  - sp-frag\n');
        expect(idx.drops).toEqual(['hp-shard', 'sp-frag']);
    });

    it('rejects non-array', () => {
        expect(() => parseDropIndex('drops: 99')).toThrow(/array/);
    });
});
