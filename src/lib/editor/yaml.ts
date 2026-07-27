/**
 * src/lib/editor/yaml.ts
 * --------------------------------------------------------------------------
 * Serialize a Level back to YAML. Symmetric counterpart of
 * src/lib/levels/parser.ts — what you save should round-trip through parse.
 *
 * Pure / sync, no I/O. Used by the Vite editor middleware to write
 * public/data/levels/<id>.yaml.
 */

import { dump as stringifyYaml } from 'js-yaml';

import { formatImageSize, type Level } from '@/lib/levels/types';

export function serializeLevelYaml(level: Level): string {
    return stringifyYaml(
        {
            title: level.title,
            background: level.background,
            imageSize: formatImageSize(level.imageSize),
            promptFile: level.promptFile,
            airWalls: level.airWalls,
        },
        {
            lineWidth: -1,
            sortKeys: false,
            noRefs: true,
        },
    );
}