/**
 * src/game/materials/logic.ts
 * --------------------------------------------------------------------------
 * Pure calculations for material depth / Z-indexing / sorting.
 *
 * Depth ranges:
 *   - 'background': 0..500 (below characters / enemies / walls)
 *   - 'y-sort': Y-coordinate + offset (dynamic occlusion based on Y position)
 *   - 'foreground': 10000+ (always renders in front of characters and HUDs)
 */

import { DEPTH } from '@/lib/constants';
import type { MaterialMode } from '@/lib/levels/types';

/**
 * Calculate the Phaser depth value for a material sprite.
 */
export function calculateMaterialDepth(
    mode: MaterialMode = 'y-sort',
    y: number,
    depthOffset = 0,
): number {
    if (mode === 'background') {
        return DEPTH.MATERIAL_BACKGROUND + depthOffset;
    }
    if (mode === 'foreground') {
        return DEPTH.FOREGROUND_MATERIAL + depthOffset;
    }
    // y-sort: Y-coordinate directly maps to depth for 2.5D occlusion
    return Math.round(y) + depthOffset;
}
