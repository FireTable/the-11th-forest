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

import { useGameStore } from '@/store/game-store';

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
    /** Weapon ids referenced by monster specs in this level. Their
     *  `visual.texture` is NOT loaded — only `bullet.texture` is.
     *  Scene uses this set to call `loadWeaponAssets` with
     *  `loadVisualTexture: false` for monster weapons. */
    monsterWeaponIds: Set<string>;
    /** Weapon ids the player can hold / see rendered: character hotbar
     *  + tavern dropSpawn entries. These get the full visual+bullet
     *  texture load. */
    playerWeaponIds: Set<string>;
    /** Tavern mode only: all available characters for NPC display + selection. */
    allCharacters?: CharacterSpec[];
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

    // Pick the character for this scene, in priority order:
    //   1. Player's tavern selection (persisted) — survives into every
    //      non-tavern scene so the picked character follows the player.
    //   2. The level's `character:` field — author override per level.
    //   3. First character in index.yaml — fall-back for fresh starts
    //      before the player has picked anyone.
    const selectedCharacterId = useGameStore.getState().selectedCharacterId;
    const characterId =
        selectedCharacterId ?? level.character ?? (await deps.fetchFirstCharacterId());
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

    // Weapon ids come from three sources:
    //   1. character.hotbar (starting weapons, normally empty in tavern)
    //   2. monster weapon ids (monster AI uses these)
    //   3. dropSpawn entries with a weaponId override (tavern pickups)
    //      — these are static-spawn weapon drops, not monster drops.
    //      Without collecting them here the WeaponSpec lookup map
    //      would be empty for the tavern and DropController couldn't
    //      resolve the spawn's `weaponId` to a spec.
    //   4. savedSlots weapon ids — weapons the player picked up in
    //      a previous tavern session and persisted via the zustand
    //      store. Without these the in-hand weapon visual has no
    //      texture to render after a scene transition into a
    //      non-tavern level.
    const spawnWeaponIds = new Set<string>();
    level.dropSpawns?.forEach((d) => {
        if (d.weaponId) spawnWeaponIds.add(d.weaponId);
    });
    const savedSlotIds = new Set<string>(
        (useGameStore.getState().slots ?? []).map((s) => s.id),
    );
    // Player-pickupable weapons: spec hotbar + tavern dropSpawn ids +
    // persisted player pickups. These get their in-hand texture
    // loaded because the player holds them and they're rendered as
    // drops on the ground.
    const playerWeaponIds = new Set<string>([
        ...character.hotbar,
        ...spawnWeaponIds,
        ...savedSlotIds,
    ]);
    // Monster weapons: only need their bullet texture loaded, never
    // held by the player. Kept out of the player set so the loader
    // skips `visual.texture` for them.
    const allWeaponIds = new Set<string>([...playerWeaponIds, ...monsterWeaponIds]);
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

    // Tavern mode: also load every available character so NPC sprites
    // can be spawned for selection. fetchCharacterIndex is cheap (cached
    // by the browser after the first call).
    let allCharacters: CharacterSpec[] | undefined;
    if (level.tavern) {
        const charIndex = await fetchCharacterIndex();
        const specs = await Promise.all(charIndex.characters.map((cid) => fetchCharacter(cid)));
        allCharacters = specs;
    }

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
        monsterWeaponIds,
        playerWeaponIds,
        ...(allCharacters ? { allCharacters } : {}),
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
        monsterWeaponIds: resolved.monsterWeaponIds,
        playerWeaponIds: resolved.playerWeaponIds,
        ...(resolved.allCharacters ? { allCharacters: resolved.allCharacters } : {}),
    };
}
