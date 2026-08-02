import { describe, it, expect } from 'vitest';

import { parseCharacterIndex, parseCharacterYaml } from '@/lib/characters/parser';

describe('parseCharacterYaml', () => {
    const validYaml = `
id: wanderer
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
                validYaml.replace('hotbar:\n  - pistol\n  - shotgun\n  - smg\n', 'hotbar: []'),
                'wanderer',
            ),
        ).toThrow(/hotbar/);
    });

    it('rejects hotbar with non-string entry', () => {
        expect(() =>
            parseCharacterYaml(validYaml.replace('  - pistol', '  - 42'), 'wanderer'),
        ).toThrow(/hotbar/);
    });

    it('rejects hotbar with empty-string entry', () => {
        expect(() =>
            parseCharacterYaml(validYaml.replace('  - pistol', '  - ""'), 'wanderer'),
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

    it('parses optional sprite block', () => {
        const spriteYaml = `
sprite:
  texture: assets/image/characters/wanderer.png
  grid: { rows: 4, cols: 4 }
  scale: 0.3
`;
        const yamlText = validYaml + spriteYaml;
        const c = parseCharacterYaml(yamlText, 'wanderer');
        expect(c.sprite).toEqual({
            texture: 'assets/image/characters/wanderer.png',
            grid: { rows: 4, cols: 4 },
            scale: 0.3,
        });
    });

    it('rejects sprite with non-positive scale', () => {
        const yamlText =
            validYaml + 'sprite:\n  texture: a.png\n  grid: { rows: 4, cols: 4 }\n  scale: 0\n';
        expect(() => parseCharacterYaml(yamlText, 'wanderer')).toThrow(/sprite\.scale/);
    });

    it('parses optional anims block with multiple tracks', () => {
        const animsYaml = `
anims:
  idle:
    frames: [0, 4]
    frameRate: 6
    repeat: -1
  run:
    frames: [5, 9]
    frameRate: 12
    repeat: -1
  run-stop:
    frames: [10, 14]
    frameRate: 10
    repeat: 0
`;
        const yamlText = validYaml + animsYaml;
        const c = parseCharacterYaml(yamlText, 'wanderer');
        expect(c.anims).toEqual({
            idle: { frames: [0, 4], frameRate: 6, repeat: -1 },
            run: { frames: [5, 9], frameRate: 12, repeat: -1 },
            'run-stop': { frames: [10, 14], frameRate: 10, repeat: 0 },
        });
    });

    it('rejects sprite missing texture', () => {
        const yamlText = validYaml + 'sprite:\n  frameWidth: 64\n  frameHeight: 64\n';
        expect(() => parseCharacterYaml(yamlText, 'wanderer')).toThrow(/sprite\.texture/);
    });

    it('rejects anims with malformed frames tuple', () => {
        const yamlText =
            validYaml + 'anims:\n  idle:\n    frames: [0]\n    frameRate: 6\n    repeat: -1\n';
        expect(() => parseCharacterYaml(yamlText, 'wanderer')).toThrow(/anims\.idle\.frames/);
    });

    it('rejects anims with reversed frame range', () => {
        const yamlText =
            validYaml + 'anims:\n  idle:\n    frames: [5, 1]\n    frameRate: 6\n    repeat: -1\n';
        expect(() => parseCharacterYaml(yamlText, 'wanderer')).toThrow(
            /frames\[1\].*>=.*frames\[0\]/,
        );
    });

    it('rejects anims with non-positive frameRate', () => {
        const yamlText =
            validYaml + 'anims:\n  idle:\n    frames: [0, 4]\n    frameRate: 0\n    repeat: -1\n';
        expect(() => parseCharacterYaml(yamlText, 'wanderer')).toThrow(/anims\.idle\.frameRate/);
    });

    it('omits sprite/anims when not provided', () => {
        const c = parseCharacterYaml(validYaml, 'wanderer');
        expect(c.sprite).toBeUndefined();
        expect(c.anims).toBeUndefined();
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

describe('parseCharacterYaml — sfx', () => {
    const baseYaml = `
id: wanderer
name: Wanderer
hp: 100
sp: 60
moveSpeed: 10
spRegenMs: 5000
body: { halfW: 16, halfH: 24 }
dodge: { spCost: 15, speed: 14, durationMs: 220, cooldownMs: 600 }
hotbar: [pistol]
`;

    it('accepts full sfx block with tuning', () => {
        const c = parseCharacterYaml(
            `${baseYaml}
sfx:
  dodge: dodge
  hurt: player-hurt
  footstep: footstep
  footstepThrottleMs: 200
  lowHpHeartbeat: low-hp-heartbeat
  lowHpThreshold: 0.3
  lowHpPulseMs: 900
`,
            'wanderer',
        );
        expect(c.sfx).toEqual({
            dodge: 'dodge',
            hurt: 'player-hurt',
            footstep: 'footstep',
            footstepThrottleMs: 200,
            lowHpHeartbeat: 'low-hp-heartbeat',
            lowHpThreshold: 0.3,
            lowHpPulseMs: 900,
        });
    });

    it('sfx block is optional', () => {
        const c = parseCharacterYaml(baseYaml, 'wanderer');
        expect(c.sfx).toBeUndefined();
    });

    it('partial sfx block (only dodge) is accepted', () => {
        const c = parseCharacterYaml(
            `${baseYaml}
sfx:
  dodge: dodge
`,
            'wanderer',
        );
        expect(c.sfx?.dodge).toBe('dodge');
        expect(c.sfx?.footstep).toBeUndefined();
    });

    it('rejects lowHpThreshold out of (0, 1]', () => {
        expect(() =>
            parseCharacterYaml(
                `${baseYaml}
sfx:
  lowHpThreshold: 1.5
`,
                'wanderer',
            ),
        ).toThrow(/lowHpThreshold/);
    });

    it('rejects negative footstepThrottleMs', () => {
        expect(() =>
            parseCharacterYaml(
                `${baseYaml}
sfx:
  footstepThrottleMs: -10
`,
                'wanderer',
            ),
        ).toThrow(/footstepThrottleMs/);
    });
});
