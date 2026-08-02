import { describe, expect, it } from 'vitest';

import { KEY_SPACE } from '@/lib/constants';

describe('constants — KEY_SPACE', () => {
    it('is the DOM KeyboardEvent.code value for Space (32)', () => {
        // Browser standard keycode for SpaceBar — mirrors KEY_W=87 etc.
        // so the player dodge rebind from Shift → Space keeps the same
        // numeric convention as the rest of the player keymap.
        expect(KEY_SPACE).toBe(32);
    });
});
