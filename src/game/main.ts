import { AUTO, Game, Scale } from 'phaser';

import { LoadScene } from '@/game/scenes/scene';
import { fetchCharacter } from '@/lib/characters';
import { fetchDrop } from '@/lib/drops';
import { fetchLevel, fetchLevelIndex } from '@/lib/levels';
import { fetchMonster } from '@/lib/monsters';
import { fetchWeapon } from '@/lib/weapons';

import type { CharacterSpec } from '@/lib/characters';
import type { DropSpec } from '@/lib/drops';
import type { MonsterSpec } from '@/lib/monsters';
import type { WeaponSpec } from '@/lib/weapons';

// ponytail: hotbar is hard-coded for the demo (3 weapons, no UI for adding
// more). Move to characters/<id>.yaml when the runtime character owns a
// persistent loadout; today this is a fixed player preset.
const HOTBAR_IDS = ['pistol', 'shotgun', 'smg'] as const;

/**
 * Demo scene initialiser — Phase 1: wanderer is a single hard-coded id.
 * Phases 3+ route the level's `character:` field through here.
 */
const DEFAULT_CHARACTER_ID = 'wanderer';

interface ResolvedScene {
    id: string;
    level: Awaited<ReturnType<typeof fetchLevel>>;
    /** Player hotbar (3 weapons, in display order). */
    weapons: WeaponSpec[];
    /** All weapons keyed by id (player hotbar + monster weapons). */
    weaponsById: Map<string, WeaponSpec>;
    character: CharacterSpec;
    monsters: Map<string, MonsterSpec>;
    drops: Map<string, DropSpec>;
}

// Scene id resolution: ?scene=<id> URL param wins; otherwise the first
// entry in public/data/levels/index.yaml. Level is fetched here (NOT in
// the scene) because Phaser's init() does not await async work — the
// fetch would race with preload().
async function resolveScene(): Promise<ResolvedScene> {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('scene');
    const id = fromUrl ?? (await fetchLevelIndex()).levels[0];
    if (!id) throw new Error('Level index is empty — add an entry to public/data/levels/index.yaml');
    const level = await fetchLevel(id);

    const character = await fetchCharacter(level.character ?? DEFAULT_CHARACTER_ID);

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

    // Fetch all weapons: player's hotbar + monsters' weapons
    const allWeaponIds = new Set<string>([...HOTBAR_IDS, ...monsterWeaponIds]);
    const allWeaponEntries = await Promise.all(
        [...allWeaponIds].map(async (wid) => [wid, await fetchWeapon(wid)] as const),
    );
    const weaponsById = new Map<string, WeaponSpec>(allWeaponEntries);
    const weapons = HOTBAR_IDS.map((wid) => weaponsById.get(wid)!).filter(Boolean);

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
