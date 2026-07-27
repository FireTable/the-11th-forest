/**
 * src/lib/levels/index.ts
 * --------------------------------------------------------------------------
 * Public API for the levels module.
 *
 *   import { parseLevelYaml, parseLevelIndex } from '@/lib/levels'; // pure
 *   import { fetchLevel, fetchLevelIndex } from '@/lib/levels';     // async
 *
 * `fetchLevel` / `fetchLevelIndex` work in both browser and Node — they
 * route through `handle-fetch`, which translates `/data/*` to file:// URLs
 * under Node. See src/lib/handle-fetch/index.ts for the translation rules.
 */

export type {
    AirWall,
    AirWallKind,
    ImageSize,
    Level,
    LevelIndex,
} from './types';

export { parseImageSize, formatImageSize } from './types';
export { parseLevelIndex, parseLevelYaml } from './parser';
export { fetchLevel, fetchLevelIndex } from './loader';