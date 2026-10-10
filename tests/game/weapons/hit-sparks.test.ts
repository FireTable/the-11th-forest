import { describe, expect, it, vi } from 'vitest';

import { spawnHitSparks } from '@/game/weapons/hit-sparks';

describe('weapons/hit-sparks — spawnHitSparks', () => {
    it('spawns requested number of debris rectangles and sets up fade tweens', () => {
        const addedRectangles: any[] = [];
        const addedTweens: any[] = [];

        const mockScene: any = {
            add: {
                rectangle: vi.fn((x, y, w, h, color) => {
                    const rect = {
                        x,
                        y,
                        w,
                        h,
                        color,
                        setDepth: vi.fn(),
                        setStrokeStyle: vi.fn(),
                        destroy: vi.fn(),
                    };
                    addedRectangles.push(rect);
                    return rect;
                }),
            },
            tweens: {
                add: vi.fn((config) => {
                    addedTweens.push(config);
                    // verify onComplete destroys chip
                    config.onComplete?.();
                }),
            },
        };

        spawnHitSparks(mockScene, 100, 200, { count: 6, isCrit: true });

        expect(addedRectangles).toHaveLength(6);
        expect(addedTweens).toHaveLength(12); // Two-stage pop & fall tweens per chip

        // Every chip was configured with a depth, stroke style and destroyed upon tween finish
        for (const rect of addedRectangles) {
            expect(rect.setDepth).toHaveBeenCalled();
            expect(rect.setStrokeStyle).toHaveBeenCalled();
            expect(rect.destroy).toHaveBeenCalled();
        }
    });

    it('defaults to 24 chips on regular hits and 36 on crits', () => {
        const createMockScene = () => {
            let count = 0;
            return {
                add: {
                    rectangle: vi.fn(() => {
                        count++;
                        return { setDepth: vi.fn(), setStrokeStyle: vi.fn(), destroy: vi.fn() };
                    }),
                },
                tweens: { add: vi.fn() },
                getCount: () => count,
            };
        };

        const normalScene = createMockScene();
        spawnHitSparks(normalScene as any, 50, 50, {});
        expect(normalScene.getCount()).toBe(24);

        const critScene = createMockScene();
        spawnHitSparks(critScene as any, 50, 50, { isCrit: true });
        expect(critScene.getCount()).toBe(36);
    });
});
