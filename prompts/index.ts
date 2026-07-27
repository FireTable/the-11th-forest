/**
 * prompts/
 * --------------------------------------------------------------------------
 * Prompt templates for AI generation (image, music, copy, ...).
 *
 * Each template is a separate file exporting a `Prompt` object:
 *
 *   export const forestBoss = {
 *     id: 'forest-boss',
 *     kind: 'image',
 *     title: 'The 11th Forest — Boss',
 *     body: 'a corrupted forest spirit, pixel art, ...',
 *     negative: 'blurry, lowres',
 *   } as const;
 *
 * Then re-export it from this barrel so consumers can do:
 *   import { prompts } from './prompts';
 *   prompts.forEach(p => ...);
 */

export {};