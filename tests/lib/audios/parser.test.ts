import { describe, it, expect } from 'vitest';

import { parseAudioIndex, parseAudioYaml } from '@/lib/audios/parser';

describe('parseAudioYaml — sfx', () => {
    it('parses a minimal sfx spec', () => {
        const s = parseAudioYaml(`
kind: sfx
id: pickup-hp
name: Pickup HP
source: assets/audio/sfx/pickup-hp.wav
`);
        expect(s.kind).toBe('sfx');
        if (s.kind !== 'sfx') return;
        expect(s.id).toBe('pickup-hp');
        expect(s.volume).toBe(1);
        expect(s.rate).toBe(1);
        expect(s.loop).toBe(false);
    });

    it('parses full sfx spec', () => {
        const s = parseAudioYaml(`
kind: sfx
id: blade-hit
name: Blade Hit
source: assets/audio/sfx/blade-hit.wav
volume: 0.8
rate: 1.2
loop: false
prompt: short metallic clang
`);
        if (s.kind !== 'sfx') throw new Error('kind');
        expect(s.volume).toBe(0.8);
        expect(s.rate).toBe(1.2);
        expect(s.prompt).toBe('short metallic clang');
    });

    it('rejects missing id', () => {
        expect(() =>
            parseAudioYaml(`
kind: sfx
name: No Id
source: x.wav
`),
        ).toThrow(/id/);
    });

    it('rejects volume out of [0, 1]', () => {
        expect(() =>
            parseAudioYaml(`
kind: sfx
id: x
name: X
source: x.wav
volume: 1.5
`),
        ).toThrow(/volume/);
    });

    it('rejects non-positive rate', () => {
        expect(() =>
            parseAudioYaml(`
kind: sfx
id: x
name: X
source: x.wav
rate: 0
`),
        ).toThrow(/rate/);
    });

    it('rejects unknown kind', () => {
        expect(() =>
            parseAudioYaml(`
id: x
name: X
source: x.wav
`),
        ).toThrow(/kind/);
    });

    it('rejects unknown fields', () => {
        expect(() =>
            parseAudioYaml(`
kind: sfx
id: x
name: X
source: x.wav
bogus: 1
`),
        ).toThrow();
    });
});

describe('parseAudioYaml — music', () => {
    it('parses a minimal music spec', () => {
        const s = parseAudioYaml(`
kind: music
id: forest-ambient
name: Forest Ambient
source: assets/audio/music/forest-ambient.mp3
`);
        expect(s.kind).toBe('music');
        if (s.kind !== 'music') return;
        expect(s.id).toBe('forest-ambient');
        expect(s.volume).toBe(0.5);
        expect(s.fadeIn).toBe(0);
        expect(s.fadeOut).toBe(0);
    });

    it('parses full music spec', () => {
        const s = parseAudioYaml(`
kind: music
id: boss-arena
name: Boss Arena
source: assets/audio/music/boss-arena.mp3
volume: 0.7
fadeIn: 1500
fadeOut: 800
`);
        if (s.kind !== 'music') throw new Error('kind');
        expect(s.volume).toBe(0.7);
        expect(s.fadeIn).toBe(1500);
        expect(s.fadeOut).toBe(800);
    });

    it('rejects negative fadeIn', () => {
        expect(() =>
            parseAudioYaml(`
kind: music
id: x
name: X
source: x.mp3
fadeIn: -100
`),
        ).toThrow(/fadeIn/);
    });
});

describe('parseAudioIndex', () => {
    it('parses a manifest', () => {
        const idx = parseAudioIndex(`
sfx:
  - pickup-hp
  - blade-hit
music:
  - forest-ambient
`);
        expect(idx.sfx).toEqual(['pickup-hp', 'blade-hit']);
        expect(idx.music).toEqual(['forest-ambient']);
    });

    it('accepts empty lists', () => {
        const idx = parseAudioIndex(`
sfx: []
music: []
`);
        expect(idx.sfx).toEqual([]);
        expect(idx.music).toEqual([]);
    });

    it('rejects missing keys', () => {
        expect(() => parseAudioIndex('sfx:\n  - a\n')).toThrow();
    });
});
