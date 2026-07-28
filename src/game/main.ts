import { AUTO, Game, Scale } from 'phaser';

import { LoadScene } from '@/game/scenes/scene';
import { fetchCharacter, fetchCharacterIndex } from '@/lib/characters';
import { fetchDrop } from '@/lib/drops';
import { fetchLevel, fetchLevelIndex } from '@/lib/levels';
import { fetchMonster } from '@/lib/monsters';
import { fetchWeapon } from '@/lib/weapons';

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
    monsters: Map<string, MonsterSpec>;
    drops: Map<string, DropSpec>;
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

    const dropIds = new Set<string>();
    level.dropSpawns?.forEach((d) => dropIds.add(d.type));

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

    return {
        id,
        level,
        weapons,
        weaponsById,
        character,
        monsters: monsterSpecMap,
        drops: new Map(dropEntries),
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
            monsterSpecs: scene.monsters,
            dropSpecs: scene.drops,
        })],
    });
};

export default StartGame;
