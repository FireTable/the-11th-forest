import { describe, expect, it } from 'vitest';

import {
    FAKE_CAP,
    FAKE_STEP,
    FAKE_STEP_MS,
    nextFakeProgress,
} from '@/game/scenes/loading-progress';

describe('nextFakeProgress', () => {
    it('starts at 0 when called with 0 progress', () => {
        expect(nextFakeProgress(0, 0)).toBe(0);
    });

    it('advances one step per FAKE_STEP_MS tick', () => {
        // 80ms = 1 tick → 0.03
        expect(nextFakeProgress(0, FAKE_STEP_MS)).toBeCloseTo(FAKE_STEP, 5);
        // 160ms = 2 ticks → 0.06
        expect(nextFakeProgress(0, FAKE_STEP_MS * 2)).toBeCloseTo(FAKE_STEP * 2, 5);
    });

    it('caps at FAKE_CAP so the bar never visually completes early', () => {
        // Way more than enough time to fill, but capped
        expect(nextFakeProgress(0, 60_000)).toBe(FAKE_CAP);
        // Already at cap → stays
        expect(nextFakeProgress(FAKE_CAP, 60_000)).toBe(FAKE_CAP);
    });

    it('truncates partial ticks (no fractional steps)', () => {
        // 79ms < FAKE_STEP_MS → no progress
        expect(nextFakeProgress(0, FAKE_STEP_MS - 1)).toBe(0);
    });
});