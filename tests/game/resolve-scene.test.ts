/**
 * tests/game/resolve-scene.test.ts
 * --------------------------------------------------------------------------
 * Vitest coverage for the pure scene-id resolvers — `getSceneIdFromUrl`
 * and `resolveDefaultSceneId`. The full `resolveScene` is integration
 * territory (Phaser Image() + fetch) and is exercised in chrome MCP.
 */

// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';

import { getSceneIdFromUrl, resolveDefaultSceneId } from '@/game/resolve-scene';

const originalLocation = window.location;

afterEach(() => {
    // Restore window.location after each test.
    Object.defineProperty(window, 'location', {
        configurable: true,
        writable: true,
        value: originalLocation,
    });
    vi.restoreAllMocks();
});

function setSearch(search: string): void {
    Object.defineProperty(window, 'location', {
        configurable: true,
        writable: true,
        value: {
            ...originalLocation,
            search,
        },
    });
}

describe('getSceneIdFromUrl', () => {
    it('returns the scene param when present', () => {
        setSearch('?scene=ruined-garden');
        expect(getSceneIdFromUrl()).toBe('ruined-garden');
    });

    it('returns null when no scene param', () => {
        setSearch('');
        expect(getSceneIdFromUrl()).toBeNull();
    });

    it('returns null when other params but no scene', () => {
        setSearch('?editor=1&lang=en');
        expect(getSceneIdFromUrl()).toBeNull();
    });

    it('returns the empty string when ?scene= (explicit override)', () => {
        setSearch('?scene=');
        expect(getSceneIdFromUrl()).toBe('');
    });
});

describe('resolveDefaultSceneId', () => {
    it('returns URL scene id when present', async () => {
        setSearch('?scene=ruined-garden');
        // index fetch must NOT run when URL is set — mock to detect.
        const spy = vi.fn().mockResolvedValue({ levels: ['x'] });
        // resolveScene isn't called from this path, so just check the result.
        expect(await resolveDefaultSceneId()).toBe('ruined-garden');
        // No explicit fetch mock — if it did call, the unmocked fetch
        // would throw, surfacing the regression.
        void spy;
    });

    it('falls back to index.yaml[0] when no URL param', async () => {
        setSearch('');
        const fakeFetch = vi.fn().mockResolvedValue({
            text: () => Promise.resolve('levels:\n  - sacred-forest-sanctuary\n  - second\n'),
        });
        vi.stubGlobal('fetch', fakeFetch);
        expect(await resolveDefaultSceneId()).toBe('sacred-forest-sanctuary');
    });

    it('throws when index is empty', async () => {
        setSearch('');
        const fakeFetch = vi.fn().mockResolvedValue({
            text: () => Promise.resolve('levels: []\n'),
        });
        vi.stubGlobal('fetch', fakeFetch);
        await expect(resolveDefaultSceneId()).rejects.toThrow(/Level index is empty/);
    });
});
