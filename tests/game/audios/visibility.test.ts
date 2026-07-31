import { describe, expect, it } from 'vitest';

import { visibilityAction } from '@/game/audios/visibility';

describe('visibilityAction', () => {
    it('returns pause when the tab is hidden', () => {
        expect(visibilityAction(true)).toBe('pause');
    });

    it('returns resume when the tab becomes visible', () => {
        expect(visibilityAction(false)).toBe('resume');
    });
});