/**
 * src/game/resolve-scene.ts
 * --------------------------------------------------------------------------
 * Resolves a scene id into the full bundle of specs (level + weapons +
 * character + monsters + drops + audio + sprite cell) the Phaser scene
 * needs to boot.
 *
 * Lives apart from `src/game/main.ts` so the editor's in-process scene
 * restart path (`src/lib/phaser-game.ts → restartScene`) can reuse it
 * without re-importing the Phaser `Game` constructor side-effects in
 * `main.ts`. main.ts still calls this once for the initial boot.
 *
 * Pure data fetch + small image-size probe — no Phaser coupling.
 */

import type { MusicSpec, SfxSpec } from '@/lib/audios';
import { fetchAudioIndex, fetchAudioMusic, fetchAudioSfx } from '@/lib/audios';
import type { CharacterSpec } from '@/lib/characters';
import { fetchCharacter, fetchCharacterIndex } from '@/lib/characters';
import type { SceneAssets } from '@/game/scenes/scene';
import { fetchDrop } from '@/lib/drops';
import type { DropSpec } from '@/lib/drops';
import { collectDropIds, fetchLevel, fetchLevelIndex } from '@/lib/levels';
import type { MonsterSpec } from '@/lib/monsters';
import { fetchMonster } from '@/lib/monsters';
import type { WeaponSpec } from '@/lib/weapons';
import { fetchWeapon } from '@/lib/weapons';

export interface ResolvedScene {
    id: string;
    level: Awaited<ReturnType<typeof fetchLevel>>;
    /** Player hotbar (read from character.hotbar, in display order). */
    weapons: WeaponSpec[];
    /** All weapons keyed by id (player hotbar + monster weapons). */
    weaponsById: Map<string, WeaponSpec>;
    character: CharacterSpec;
    /** Computed cell size for the character sprite sheet (naturalSize / grid). */
    spriteCell: { width: number; height: number };
    monsters: Map<string, MonsterSpec>;
    drops: Map<string, DropSpec>;
    sfx: Map<string, SfxSpec>;
    music: Map<string, MusicSpec>;
}

/** Most-recently-resolved scene bundle. Set by main.ts after the initial
 *  boot resolve; read by the death overlay's Restart button so it can
 *  call `restartSceneWith` without re-fetching YAML. */
let _cached: ResolvedScene | null = null;

export function cacheResolvedScene(r: ResolvedScene): void {
    _cached = r;
}

export function getCachedResolvedScene(): ResolvedScene | null {
    return _cached;
}

/**
 * Resolve `sceneId` into a full ResolvedScene. Scene id is taken verbatim —
 * caller decides where it comes from (URL ?scene=, index.yaml[0], editor
 * jump-to).
 *
 * `getSceneIdFromUrl()` is the one runtime dependency; split out so tests
 * can supply a fixed id without touching `window.location`.
 */
export async function resolveScene(
    sceneId: string,
    deps: {
        fetchLevelId: (id: string) => ReturnType<typeof fetchLevel>;
        fetchFirstCharacterId: () => Promise<string>;
    } = {
        fetchLevelId: fetchLevel,
        fetchFirstCharacterId: async () => (await fetchCharacterIndex()).characters[0],
    },
): Promise<ResolvedScene> {
    const id = sceneId;
    const level = await deps.fetchLevelId(id);

    const characterId = level.character ?? (await deps.fetchFirstCharacterId());
    if (!characterId) {
        throw new Error('No character available — add one to public/data/characters/index.yaml');
    }
    const character = await fetchCharacter(characterId);

    const monsterSpecMap = new Map<string, MonsterSpec>();
    const monsterWeaponIds = new Set<string>();
    if (level.monsters && level.monsters.length > 0) {
        const uniqueMonsterIds = Array.from(new Set(level.monsters.map((m) => m.type)));
        const specs = await Promise.all(uniqueMonsterIds.map((mid) => fetchMonster(mid)));
        for (let i = 0; i < uniqueMonsterIds.length; i++) {
            monsterSpecMap.set(uniqueMonsterIds[i], specs[i]);
            monsterWeaponIds.add(specs[i].weaponId);
        }
    }

    const dropIds = collectDropIds(level, monsterSpecMap);
    const dropEntries = await Promise.all(
        [...dropIds].map(async (did) => [did, await fetchDrop(did)] as const),
    );

    const allWeaponIds = new Set<string>([...character.hotbar, ...monsterWeaponIds]);
    const allWeaponEntries = await Promise.all(
        [...allWeaponIds].map(async (wid) => [wid, await fetchWeapon(wid)] as const),
    );
    const weaponsById = new Map<string, WeaponSpec>(allWeaponEntries);
    const weapons = character.hotbar.map((wid) => weaponsById.get(wid)!).filter(Boolean);

    const audioIndex = await fetchAudioIndex();
    const sfxEntries = await Promise.all(
        audioIndex.sfx.map(async (id) => [id, await fetchAudioSfx(id)] as const),
    );
    const musicEntries = await Promise.all(
        audioIndex.music.map(async (id) => [id, await fetchAudioMusic(id)] as const),
    );
    const sfx = new Map<string, SfxSpec>(sfxEntries);
    const music = new Map<string, MusicSpec>(musicEntries);

    const spriteCell = await getSpriteCellDims(character);

    return {
        id,
        level,
        weapons,
        weaponsById,
        character,
        spriteCell,
        monsters: monsterSpecMap,
        drops: new Map(dropEntries),
        sfx,
        music,
    };
}

/**
 * Read the scene id from the URL `?scene=<id>` query string.
 * Returns null if absent — caller falls back to index.yaml[0].
 */
export function getSceneIdFromUrl(): string | null {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    return params.get('scene');
}

/**
 * Default scene id resolution: URL `?scene=` wins, else first entry in
 * the level index.
 */
export async function resolveDefaultSceneId(): Promise<string> {
    const fromUrl = getSceneIdFromUrl();
    if (fromUrl) return fromUrl;
    const index = await fetchLevelIndex();
    const first = index.levels[0];
    if (!first) {
        throw new Error('Level index is empty — add an entry to public/data/levels/index.yaml');
    }
    return first;
}

/**
 * Read a sprite-sheet texture's natural pixel dimensions and divide by
 * its grid layout to get cell size. Skipped when the character has no
 * sprite block (debug-rectangle fallback).
 */
export async function getSpriteCellDims(
    character: CharacterSpec,
): Promise<{ width: number; height: number }> {
    if (!character.sprite) return { width: 0, height: 0 };
    const url = character.sprite.texture.startsWith('/')
        ? character.sprite.texture
        : `/${character.sprite.texture}`;
    const natural = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => reject(new Error(`Failed to load ${url}`));
        img.src = url;
    });
    return {
        width: Math.floor(natural.width / character.sprite.grid.cols),
        height: Math.floor(natural.height / character.sprite.grid.rows),
    };
}

/** Narrow a ResolvedScene down to what LoadScene's constructor takes. */
export function toSceneAssets(resolved: ResolvedScene): SceneAssets {
    return {
        weapons: resolved.weapons,
        weaponsById: resolved.weaponsById,
        character: resolved.character,
        spriteCell: resolved.spriteCell,
        monsterSpecs: resolved.monsters,
        dropSpecs: resolved.drops,
        sfxSpecs: resolved.sfx,
        musicSpecs: resolved.music,
    };
}
