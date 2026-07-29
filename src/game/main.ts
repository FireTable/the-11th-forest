import { AUTO, Game, Scale } from 'phaser';

import { LoadScene } from '@/game/scenes/scene';
import { fetchAudioIndex, fetchAudioMusic, fetchAudioSfx } from '@/lib/audios';
import { fetchCharacter, fetchCharacterIndex } from '@/lib/characters';
import { fetchDrop } from '@/lib/drops';
import { collectDropIds, fetchLevel, fetchLevelIndex } from '@/lib/levels';
import { fetchMonster } from '@/lib/monsters';
import { fetchWeapon } from '@/lib/weapons';

import type { MusicSpec, SfxSpec } from '@/lib/audios';
import type { CharacterSpec } from '@/lib/characters';
import type { DropSpec } from '@/lib/drops';
import type { MonsterSpec } from '@/lib/monsters';
import type { WeaponSpec } from '@/lib/weapons';

interface ResolvedScene {
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

// Scene id resolution: ?scene=<id> URL param wins; otherwise the first
// entry in public/data/levels/index.yaml. Level is fetched here (NOT in
// the scene) because Phaser's init() does NOT await async work — the
// fetch would race with preload().
async function resolveScene(): Promise<ResolvedScene> {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('scene');
    const id = fromUrl ?? (await fetchLevelIndex()).levels[0];
    if (!id) throw new Error('Level index is empty — add an entry to public/data/levels/index.yaml');
    const level = await fetchLevel(id);

    // If the level doesn't pin a character, fall back to the first entry
    // in characters/index.yaml. No hard-coded id anywhere.
    const characterId = level.character
        ?? (await fetchCharacterIndex()).characters[0];
    if (!characterId) {
        throw new Error('No character available — add one to public/data/characters/index.yaml');
    }
    const character = await fetchCharacter(characterId);

    // Pre-load every monster spec + the weapon each monster uses, plus
    // every drop type referenced by this level. Avoids runtime fetch
    // races inside scene.create().
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

    // Fetch all weapons: player's hotbar (from character) + monsters' weapons.
    // Hotbar is the source of truth for which weapons the player starts with;
    // the runtime controller can mutate it later via pickups.
    const allWeaponIds = new Set<string>([...character.hotbar, ...monsterWeaponIds]);
    const allWeaponEntries = await Promise.all(
        [...allWeaponIds].map(async (wid) => [wid, await fetchWeapon(wid)] as const),
    );
    const weaponsById = new Map<string, WeaponSpec>(allWeaponEntries);
    const weapons = character.hotbar
        .map((wid) => weaponsById.get(wid)!)
        .filter(Boolean);

    // Audio: index defines which SFX + music are available globally; we
    // pre-fetch every spec so the controller can list by id immediately.
    const audioIndex = await fetchAudioIndex();
    const sfxEntries = await Promise.all(
        audioIndex.sfx.map(async (id) => [id, await fetchAudioSfx(id)] as const),
    );
    const musicEntries = await Promise.all(
        audioIndex.music.map(async (id) => [id, await fetchAudioMusic(id)] as const),
    );
    const sfx = new Map<string, SfxSpec>(sfxEntries);
    const music = new Map<string, MusicSpec>(musicEntries);

    // Compute sprite-sheet cell dims by reading the texture's natural
    // size and dividing by the spec's grid layout. Browsers expose this
    // via Image() — no extra deps. Skipped when the spec has no sprite.
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
 * Read a sprite-sheet texture's natural pixel dimensions and divide by
 * its grid layout to get cell size. Resolves to a placeholder when the
 * character has no sprite block (debug-rectangle fallback).
 */
async function getSpriteCellDims(
    character: CharacterSpec,
): Promise<{ width: number; height: number }> {
    if (!character.sprite) return { width: 0, height: 0 };
    const url = character.sprite.texture.startsWith('/')
        ? character.sprite.texture
        : `/${character.sprite.texture}`;
    const natural = await new Promise<{ width: number; height: number }>(
        (resolve, reject) => {
            const img = new Image();
            img.onload = () =>
                resolve({ width: img.naturalWidth, height: img.naturalHeight });
            img.onerror = () => reject(new Error(`Failed to load ${url}`));
            img.src = url;
        },
    );
    return {
        width: Math.floor(natural.width / character.sprite.grid.cols),
        height: Math.floor(natural.height / character.sprite.grid.rows),
    };
}

const StartGame = async (parent: string): Promise<Phaser.Game> => {
    const scene = await resolveScene();
    // World size matches the level's native image dimensions so air-wall
    // coords (defined in image pixel space) align 1:1. The canvas itself
    // is scaled down via Scale.FIT to fit the viewport.
    return new Game({
        type: AUTO,
        parent,
        backgroundColor: '#000000',
        scale: {
            mode: Scale.FIT,
            autoCenter: Scale.CENTER_BOTH,
            width: scene.level.imageSize.width,
            height: scene.level.imageSize.height,
        },
        // Top-down shooter — no gravity, walls are static obstacles.
        // Debug rendering off in prod; flip on for level design.
        physics: {
            default: 'matter',
            matter: {
                gravity: { x: 0, y: 0 },
                debug: false,
            },
        },
        scene: [new LoadScene(scene.id, scene.level, {
            weapons: scene.weapons,
            weaponsById: scene.weaponsById,
            character: scene.character,
            spriteCell: scene.spriteCell,
            monsterSpecs: scene.monsters,
            dropSpecs: scene.drops,
            sfxSpecs: scene.sfx,
            musicSpecs: scene.music,
        })],
    });
};

export default StartGame;
