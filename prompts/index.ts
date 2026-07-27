/**
 * prompts/
 * --------------------------------------------------------------------------
 * Prompt templates for AI generation (image, music, copy, ...).
 *
 * Scenes (render order, see ./scenes.ts):
 *   import { scenes } from './prompts';
 *   scenes.forEach(s => ...);
 *
 * Each scene entry:
 *   {
 *     number: 1,                     // render order
 *     id: 'outer-forest-scene',
 *     kind: 'image',
 *     size: '2752x1536',              // image prompts only
 *     title: 'The 11th Forest — ...',
 *     body: '...',                    // fed to the AI
 *     negative: '...',                // fed as negative prompt
 *   }
 */

import { scenes } from './scenes';

export { scenes };
export const prompts = scenes;