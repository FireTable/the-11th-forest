/**
 * src/lib/audios/index.ts
 * --------------------------------------------------------------------------
 * Public API for the audios module.
 */

export type { AudioIndex, MusicSpec, SfxSpec, SoundSpec } from './types';
export { parseAudioIndex, parseAudioYaml } from './parser';
export { fetchAudioIndex, fetchAudioMusic, fetchAudioSfx } from './loader';
