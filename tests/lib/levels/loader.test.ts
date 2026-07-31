import { describe, it, expect } from 'vitest';

import {
    formatImageSize,
    parseImageSize,
} from '@/lib/levels/types';
import { parseLevelYaml, parseLevelIndex } from '@/lib/levels/parser';

describe('parseImageSize / formatImageSize', () => {
    it('parses "WxH" into { width, height }', () => {
        expect(parseImageSize('2752x1536')).toEqual({ width: 2752, height: 1536 });
        expect(parseImageSize('1280x720')).toEqual({ width: 1280, height: 720 });
    });

    it('throws on bad input', () => {
        expect(() => parseImageSize('abc')).toThrow();
        expect(() => parseImageSize('2752')).toThrow();
        expect(() => parseImageSize('2752x')).toThrow();
    });

    it('round-trips through formatImageSize', () => {
        const s = { width: 1024, height: 1024 };
        expect(parseImageSize(formatImageSize(s))).toEqual(s);
    });
});

describe('parseLevelYaml', () => {
    const validYaml = `
title: The 11th Forest — Sacred Forest Sanctuary
background: assets/image/scenes/sacred-forest-sanctuary.png
imageSize: 2752x1536
airWalls: []
`;

    it('parses a minimal valid level', () => {
        const level = parseLevelYaml(validYaml, 'sacred-forest-sanctuary');
        expect(level.title).toBe('The 11th Forest — Sacred Forest Sanctuary');
        expect(level.background).toBe('assets/image/scenes/sacred-forest-sanctuary.png');
        expect(level.imageSize).toEqual({ width: 2752, height: 1536 });
        expect(level.airWalls).toEqual([]);
    });

    it('parses polygon air walls of both kinds', () => {
        const yamlText = `
title: test
background: a.png
imageSize: 100x100
airWalls:
  - id: w1
    kind: tall
    points:
      - [10, 20]
      - [40, 20]
      - [40, 60]
      - [10, 60]
  - id: w2
    kind: short
    points:
      - [50, 60]
      - [55, 60]
      - [55, 65]
`;
        const level = parseLevelYaml(yamlText, 'test');
        expect(level.airWalls).toHaveLength(2);
        expect(level.airWalls[0]).toEqual({
            id: 'w1',
            kind: 'tall',
            points: [
                [10, 20],
                [40, 20],
                [40, 60],
                [10, 60],
            ],
        });
        expect(level.airWalls[1].kind).toBe('short');
    });

    it('migrates legacy rect air walls to 4-vertex polygons', () => {
        const yamlText = `
title: test
background: a.png
imageSize: 100x100
airWalls:
  - { id: w1, kind: tall, x: 10, y: 20, width: 30, height: 40 }
`;
        const level = parseLevelYaml(yamlText, 'test');
        expect(level.airWalls[0].points).toEqual([
            [10, 20],
            [40, 20],
            [40, 60],
            [10, 60],
        ]);
    });

    it('rejects polygons with fewer than 3 vertices', () => {
        const yamlText = `
title: t
background: a.png
imageSize: 1x1
airWalls:
  - id: w1
    kind: tall
    points:
      - [0, 0]
      - [10, 0]
`;
        expect(() => parseLevelYaml(yamlText, 't')).toThrow(/Too small|at least 3/);
    });

    it('rejects invalid air wall kind', () => {
        const yamlText = `
title: t
background: a.png
imageSize: 1x1
airWalls:
  - id: w1
    kind: huge
    points:
      - [0, 0]
      - [1, 0]
      - [0, 1]
`;
        expect(() => parseLevelYaml(yamlText, 't')).toThrow(/Invalid input|kind/);
    });

    it('rejects non-positive legacy wall dimensions', () => {
        const yamlText = `
title: t
background: a.png
imageSize: 1x1
airWalls:
  - { id: w1, kind: tall, x: 0, y: 0, width: 0, height: 1 }
`;
        expect(() => parseLevelYaml(yamlText, 't')).toThrow(/Too small|either/);
    });

    it('rejects missing required fields', () => {
        const yamlText = `
title: t
background: a.png
`;
        expect(() => parseLevelYaml(yamlText, 't')).toThrow(/imageSize/);
    });

    it('parses optional Phase-1+ spawn fields', () => {
        const yamlText = `
title: Spawny
background: a.png
imageSize: 100x100
airWalls: []
character: wanderer
monsters:
  - type: drone
    x: 400
    y: 400
  - type: gunner
    x: 800
    y: 200
dropSpawns:
  - type: hp-shard
    x: 200
    y: 800
`;
        const level = parseLevelYaml(yamlText, 'spawny');
        expect(level.character).toBe('wanderer');
        expect(level.monsters).toEqual([
            { type: 'drone', x: 400, y: 400 },
            { type: 'gunner', x: 800, y: 200 },
        ]);
        expect(level.dropSpawns).toEqual([{ type: 'hp-shard', x: 200, y: 800 }]);
    });

    it('omits spawn fields when absent', () => {
        const yamlText = `
title: Plain
background: a.png
imageSize: 1x1
airWalls: []
`;
        const level = parseLevelYaml(yamlText, 'plain');
        expect(level.character).toBeUndefined();
        expect(level.monsters).toBeUndefined();
        expect(level.dropSpawns).toBeUndefined();
    });

    it('rejects malformed monster spawn (missing type)', () => {
        const yamlText = `
title: t
background: a.png
imageSize: 1x1
airWalls: []
monsters:
  - at: [10, 20]
`;
        expect(() => parseLevelYaml(yamlText, 't')).toThrow(/Invalid input|type/);
    });

    it('rejects monster spawn with invalid coordinates', () => {
        const yamlText = `
title: t
background: a.png
imageSize: 1x1
airWalls: []
monsters:
  - type: drone
    x: 10
`;
        expect(() => parseLevelYaml(yamlText, 't')).toThrow(/Invalid input|numbers x and y/);
    });

    it('parses characterSpawn with x/y + facing', () => {
        const yamlText = `
title: t
background: a.png
imageSize: 100x100
airWalls: []
characterSpawn:
  x: 200
  y: 300
  facing: left
`;
        const level = parseLevelYaml(yamlText, 't');
        expect(level.characterSpawn).toEqual({ x: 200, y: 300, facing: 'left' });
    });

    it('omits characterSpawn when absent', () => {
        const yamlText = `
title: Plain
background: a.png
imageSize: 1x1
airWalls: []
`;
        const level = parseLevelYaml(yamlText, 'plain');
        expect(level.characterSpawn).toBeUndefined();
    });

    it('rejects characterSpawn with invalid facing', () => {
        const yamlText = `
title: t
background: a.png
imageSize: 1x1
airWalls: []
characterSpawn:
  x: 10
  y: 20
  facing: sideways
`;
        expect(() => parseLevelYaml(yamlText, 't')).toThrow(/Invalid input|facing/);
    });

    it('rejects characterSpawn without x and y', () => {
        const yamlText = `
title: t
background: a.png
imageSize: 1x1
airWalls: []
characterSpawn:
  facing: right
`;
        expect(() => parseLevelYaml(yamlText, 't')).toThrow(/Invalid input|numbers x and y/);
    });
});

describe('parseLevelIndex', () => {
    it('parses a single-entry manifest', () => {
        const idx = parseLevelIndex('levels:\n  - sacred-forest-sanctuary\n');
        expect(idx.levels).toEqual(['sacred-forest-sanctuary']);
    });

    it('preserves order across multiple entries', () => {
        const idx = parseLevelIndex(`
levels:
  - aaa-first
  - bbb-second
  - ccc-third
`);
        expect(idx.levels).toEqual(['aaa-first', 'bbb-second', 'ccc-third']);
    });

    it('rejects non-array `levels`', () => {
        expect(() => parseLevelIndex('levels: 42')).toThrow(/array/);
    });

    it('rejects non-string entries', () => {
        expect(() => parseLevelIndex('levels:\n  - 42\n')).toThrow(/expected string|non-empty string/);
    });
});