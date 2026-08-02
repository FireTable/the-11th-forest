// Stub Phaser so importing status-hud.ts (which pulls in the runtime) works
// in Node — the helper under test doesn't touch Phaser at all.
vi.mock('phaser', () => ({}));

import { describe, expect, it, vi } from 'vitest';

import { computeFloatingNumberSpawn } from '@/game/hubs/status-hud';

/**
 * Tests the pure spawn-offset helper used by StatusHud.showFloatingNumber.
 * A deterministic jitterFn makes the random offsets observable in tests.
 */
describe('status-hud — computeFloatingNumberSpawn', () => {
    it('returns the base point when jitter returns 0.5', () => {
        const result = computeFloatingNumberSpawn(10, 5, () => 0.5);
        expect(result).toEqual({ x: 10, y: 5 });
    });

    it('spreads horizontally by ±8 px around the base', () => {
        expect(computeFloatingNumberSpawn(0, 0, () => 0).x).toBe(-8);
        expect(computeFloatingNumberSpawn(0, 0, () => 1).x).toBe(8);
    });

    it('spreads vertically by ±4 px around the base', () => {
        expect(computeFloatingNumberSpawn(0, 0, () => 0).y).toBe(-4);
        expect(computeFloatingNumberSpawn(0, 0, () => 1).y).toBe(4);
    });

    it('combines x and y from two jitter draws (called twice)', () => {
        // First call: x jitter (0 → -8). Second call: y jitter (1 → +4).
        let call = 0;
        const seq = [0, 1];
        const result = computeFloatingNumberSpawn(20, 30, () => seq[call++]);
        expect(result).toEqual({ x: 12, y: 34 });
    });

    it('uses Math.random by default (sanity check that injection works)', () => {
        // With jitterFn omitted the helper still returns finite numbers —
        // we just verify the default-path doesn't throw and stays bounded.
        const r = computeFloatingNumberSpawn(0, 0);
        expect(Math.abs(r.x)).toBeLessThanOrEqual(8);
        expect(Math.abs(r.y)).toBeLessThanOrEqual(4);
    });
});
