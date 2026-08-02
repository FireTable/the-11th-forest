/**
 * src/lib/audios/loader.ts
 * --------------------------------------------------------------------------
 * Async fetch wrappers. Same shape as `drops/loader.ts` — `fetchAudio`
 * fetches + parses one YAML, `fetchAudioIndex` fetches the manifest.
 *
 * The base path is split per kind so SFX and music can live in
 * dedicated subdirectories: `data/audios/sfx/<id>.yaml` and
 * `data/audios/music/<id>.yaml`.
 *
 * The `kind` field on the YAML is the source of truth — wrong kind on
 * the wrong path throws so a misfiled asset surfaces immediately.
 */

import { fetch } from '@/lib/handle-fetch';

import { parseAudioIndex, parseAudioYaml } from './parser';
import type { AudioIndex, MusicSpec, SfxSpec, SoundSpec } from './types';

const BASE_SFX = '/data/audios/sfx';
const BASE_MUSIC = '/data/audios/music';

function expectKind<T extends SoundSpec>(spec: SoundSpec, kind: T['kind'], id: string): T {
    if (spec.kind !== kind) {
        throw new Error(`Audio ${id}: expected kind=${kind}, got ${spec.kind}`);
    }
    return spec as T;
}

export async function fetchAudioSfx(id: string): Promise<SfxSpec> {
    const text = await (await fetch(`${BASE_SFX}/${id}.yaml`)).text();
    const spec = parseAudioYaml(text);
    return expectKind<SfxSpec>(spec, 'sfx', id);
}

export async function fetchAudioMusic(id: string): Promise<MusicSpec> {
    const text = await (await fetch(`${BASE_MUSIC}/${id}.yaml`)).text();
    const spec = parseAudioYaml(text);
    return expectKind<MusicSpec>(spec, 'music', id);
}

export async function fetchAudioIndex(): Promise<AudioIndex> {
    const text = await (await fetch('/data/audios/index.yaml')).text();
    return parseAudioIndex(text);
}
