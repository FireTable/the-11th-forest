import { describe, it, expect } from 'vitest';

import { parseLevelYaml } from '@/lib/levels/parser';
import type { Level } from '@/lib/levels/types';

import { serializeLevelYaml } from '@/lib/editor/yaml';

const minimal: Level = {
    title: 'The 11th Forest — Sacred Forest Sanctuary',
    background: 'assets/image/scenes/sacred-forest-sanctuary.png',
    imageSize: { width: 2752, height: 1536 },
    promptFile: 'prompts/scenes/sacred-forest-sanctuary.yaml',
    airWalls: [],
};

describe('serializeLevelYaml', () => {
    it('round-trips through parseLevelYaml (empty airWalls)', () => {
        const text = serializeLevelYaml(minimal);
        expect(parseLevelYaml(text, 'sacred-forest-sanctuary')).toEqual(minimal);
    });

    it('round-trips with polygon air walls', () => {
        const level: Level = {
            ...minimal,
            airWalls: [
                {
                    id: 'w1',
                    kind: 'tall',
                    points: [
                        [10, 20],
                        [40, 20],
                        [40, 60],
                        [10, 60],
                    ],
                },
                {
                    id: 'w2',
                    kind: 'short',
                    points: [
                        [50, 60],
                        [55, 60],
                        [55, 65],
                    ],
                },
            ],
        };
        const text = serializeLevelYaml(level);
        expect(parseLevelYaml(text, 'test')).toEqual(level);
    });

    it('emits imageSize as "WxH" string', () => {
        const text = serializeLevelYaml(minimal);
        expect(text).toMatch(/^imageSize: 2752x1536$/m);
    });

    it('emits empty airWalls as inline []', () => {
        const text = serializeLevelYaml(minimal);
        expect(text).toMatch(/^airWalls: \[\]$/m);
    });

    it('preserves key order (title, background, imageSize, promptFile, airWalls)', () => {
        const text = serializeLevelYaml(minimal);
        const keys = ['title', 'background', 'imageSize', 'promptFile', 'airWalls'];
        let cursor = -1;
        for (const key of keys) {
            const idx = text.indexOf(`${key}:`, cursor + 1);
            expect(idx).toBeGreaterThan(cursor);
            cursor = idx;
        }
    });

    it('round-trips characterSpawn (regression: save used to drop it)', () => {
        const level: Level = {
            ...minimal,
            character: 'wanderer',
            characterSpawn: { x: 500, y: 1300, facing: 'right' },
        };
        const text = serializeLevelYaml(level);
        // characterSpawn must be present in the emitted YAML.
        expect(text).toContain('characterSpawn:');
        // And it must round-trip through the parser unchanged.
        expect(parseLevelYaml(text, 'test')).toEqual(level);
    });

    it('omits undefined optional fields entirely', () => {
        const text = serializeLevelYaml(minimal);
        expect(text).not.toContain('character:');
        expect(text).not.toContain('characterSpawn:');
        expect(text).not.toContain('monsters:');
        expect(text).not.toContain('dropSpawns:');
    });
});