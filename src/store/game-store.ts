import { create } from 'zustand';
import { persist } from 'zustand/middleware';


export interface WeaponSlotData {
    id: string;
    name: string;
    ammo: number;
    clipSize: number;
    /** Public-path URL for the weapon thumbnail (e.g. `/assets/image/weapons/arcana-staff.png`).
     *  Undefined for melee weapons or spec.visual entries without a texture. */
    texture?: string;
}

export interface LevelWaveProgress {
    currentWaveIndex: number;
    clearedWaveIds: string[];
}

export interface PlayerSnapshot {
    x: number;
    y: number;
}

export interface MonsterEntitySnapshot {
    specId: string;
    hp: number;
    x: number;
    y: number;
    waveId?: string;
    spawnIndex?: number;
}

export interface MonsterSystemSnapshot {
    activeMonsters: MonsterEntitySnapshot[];
    pendingSpawnIndices: number[];
}

export interface DropEntitySnapshot {
    specId: string;
    x: number;
    y: number;
    /** When this drop is a weapon pickup, the resolved weapon id is
     *  recorded so the drop's in-hand texture can be restored on
     *  refresh. Undefined for non-weapon drops (heal / ammo / etc.). */
    weaponId?: string;
}

export interface GameUIState {
    // Character Status
    characterName: string;
    hp: number;
    maxHp: number;
    sp: number;
    maxSp: number;

    // Weapon Status
    activeWeaponIndex: number;
    activeWeaponName: string;
    activeAmmo: number;
    activeMaxAmmo: number;
    isReloading: boolean;
    reloadProgress: number; // 0 to 1
    slots: WeaponSlotData[];

    // Level & Save Status
    levelTitle: string;
    currentLevelId: string;
    /** Map of levelId -> wave progress, allowing independent per-level wave tracking. */
    levelProgressMap: Record<string, LevelWaveProgress>;
    /** Elapsed milliseconds since the current level started. Driven by
     *  the scene's update() loop; HUDs read it to display MM:SS. */
    levelElapsedMs: number;

    // Entity Snapshots for Fine-Grained Mid-Combat Save/Restore
    playerSnapshot?: PlayerSnapshot;
    activeMonstersSnapshot?: MonsterSystemSnapshot;
    groundDropsSnapshot?: DropEntitySnapshot[];

    // Visibility
    hubsVisible: boolean;

    // Death state — true while the character's HP has reached 0 and
    // the scene is paused. The HUD overlays a restart prompt; the
    // Phaser scene pauses until the user clicks Restart.
    isDead: boolean;

    // Victory state — true when the final level's waves and monsters are all cleared.
    isVictory: boolean;

    // Tavern / character selection state
    /** Persisted id of the character the player selected in the tavern.
     *  null = never selected (tavern not yet completed). */
    selectedCharacterId: string | null;
    /** true once the player has finished the tavern (selected a character
     *  + entered the first real level). Resets on clearSaveData. */
    tavernCleared: boolean;
    /** How many weapons the player has picked up in the current tavern
     *  session. Not persisted — resets each time the tavern scene loads. */
    tavernWeaponCount: number;

    // Setters
    setLevelTitle: (title: string) => void;
    setCurrentLevelId: (levelId: string) => void;
    setWaveProgress: (levelId: string, progress: Partial<LevelWaveProgress>) => void;
    setLevelElapsedMs: (ms: number) => void;
    setEntitySnapshots: (snapshots: {
        player?: PlayerSnapshot;
        monsters?: MonsterSystemSnapshot;
        drops?: DropEntitySnapshot[];
        /** Level clock, piggybacked so a save costs one store write. */
        elapsedMs?: number;
    }) => void;
    setCharacterStats: (stats: {
        name?: string;
        hp: number;
        maxHp: number;
        sp: number;
        maxSp: number;
    }) => void;
    setWeaponStats: (stats: {
        activeIndex: number;
        name: string;
        ammo: number;
        maxAmmo: number;
        isReloading: boolean;
        reloadProgress: number;
        slots: WeaponSlotData[];
    }) => void;
    setHubsVisible: (visible: boolean) => void;
    setDead: (dead: boolean) => void;
    setVictory: (victory: boolean) => void;
    resetLevelProgress: (levelId: string) => void;
    /**
     * Clear per-scene entity snapshots only (player/monster/drop
     * positions). Preserves the player's hotbar, HP, SP, and
     * character choice. Used by scene transitions (teleport, Jump-
     * to-scene) so picked-up weapons survive the cut.
     */
    clearSceneSnapshots: () => void;
    clearSaveData: () => void;
    setSelectedCharacterId: (id: string | null) => void;
    setTavernCleared: (cleared: boolean) => void;
    setTavernWeaponCount: (n: number) => void;
}

export const initialGameState = {
    characterName: '',
    hp: 0,
    maxHp: 0,
    sp: 0,
    maxSp: 0,

    activeWeaponIndex: 0,
    activeWeaponName: '',
    activeAmmo: 0,
    activeMaxAmmo: 0,
    isReloading: false,
    reloadProgress: 0,
    slots: [] as WeaponSlotData[],

    levelTitle: '',
    currentLevelId: '',
    levelProgressMap: {} as Record<string, LevelWaveProgress>,
    levelElapsedMs: 0,

    playerSnapshot: undefined as PlayerSnapshot | undefined,
    activeMonstersSnapshot: undefined as MonsterSystemSnapshot | undefined,
    groundDropsSnapshot: undefined as DropEntitySnapshot[] | undefined,

    hubsVisible: true,
    isDead: false,
    isVictory: false,

    selectedCharacterId: null as string | null,
    tavernCleared: false,
    tavernWeaponCount: 0,
};

export const useGameStore = create<GameUIState>()(
    persist(
        (set) => ({
            ...initialGameState,

            setLevelTitle: (title) => set({ levelTitle: title }),

            setCurrentLevelId: (levelId) => set({ currentLevelId: levelId }),

            setWaveProgress: (levelId, progress) =>
                set((state) => {
                    const targetLevelId = levelId || state.currentLevelId;
                    if (!targetLevelId) return state;
                    const existing = state.levelProgressMap[targetLevelId] || {
                        currentWaveIndex: 0,
                        clearedWaveIds: [],
                    };
                    return {
                        levelProgressMap: {
                            ...state.levelProgressMap,
                            [targetLevelId]: {
                                currentWaveIndex: progress.currentWaveIndex ?? existing.currentWaveIndex,
                                clearedWaveIds: progress.clearedWaveIds ?? existing.clearedWaveIds,
                            },
                        },
                    };
                }),

            setLevelElapsedMs: (ms) => set({ levelElapsedMs: ms }),

            setEntitySnapshots: (snapshots) =>
                set((state) => ({
                    ...state,
                    playerSnapshot: snapshots.player ?? state.playerSnapshot,
                    activeMonstersSnapshot: snapshots.monsters ?? state.activeMonstersSnapshot,
                    groundDropsSnapshot: snapshots.drops ?? state.groundDropsSnapshot,
                    levelElapsedMs: snapshots.elapsedMs ?? state.levelElapsedMs,
                })),

            setCharacterStats: (stats) =>
                set((state) => ({
                    ...state,
                    characterName: stats.name ?? state.characterName,
                    hp: stats.hp,
                    maxHp: stats.maxHp,
                    sp: stats.sp,
                    maxSp: stats.maxSp,
                })),

            setWeaponStats: (stats) =>
                set((state) => ({
                    ...state,
                    activeWeaponIndex: stats.activeIndex,
                    activeWeaponName: stats.name,
                    activeAmmo: stats.ammo,
                    activeMaxAmmo: stats.maxAmmo,
                    isReloading: stats.isReloading,
                    reloadProgress: stats.reloadProgress,
                    slots: stats.slots,
                })),

            setHubsVisible: (visible) => set({ hubsVisible: visible }),

            setDead: (dead) => set({ isDead: dead }),

            setVictory: (victory) => set({ isVictory: victory }),

            resetLevelProgress: (levelId) =>
                set((state) => {
                    const newMap = { ...state.levelProgressMap };
                    delete newMap[levelId];
                    return {
                        levelProgressMap: newMap,
                        hp: 0,
                        sp: 0,
                        slots: [],
                        playerSnapshot: undefined,
                        activeMonstersSnapshot: undefined,
                        groundDropsSnapshot: undefined,
                        levelElapsedMs: 0,
                    };
                }),

            /**
             * Clear only the per-scene entity snapshots so the new
             * scene's loadCharacter() reads a clean slate. Used by
             * scene transitions (teleport, Jump-to-scene) where the
             * player's stats / hotbar must survive — only the world
             * position should reset.
             */
            clearSceneSnapshots: () =>
                set(() => ({
                    playerSnapshot: undefined,
                    activeMonstersSnapshot: undefined,
                    groundDropsSnapshot: undefined,
                })),

            clearSaveData: () => {
                try {
                    useGameStore.persist?.clearStorage();
                } catch {
                    // Fallback
                }
                set(() => ({ ...initialGameState, tavernCleared: false, selectedCharacterId: null, }));
            },

            setSelectedCharacterId: (id) => set({ selectedCharacterId: id }),
            setTavernCleared: (cleared) => set({ tavernCleared: cleared }),
            setTavernWeaponCount: (n) => set({ tavernWeaponCount: n }),
        }),
        {
            name: '11th_forest_save_v2',
            partialize: (state) => ({
                currentLevelId: state.currentLevelId,
                levelProgressMap: state.levelProgressMap,
                characterName: state.characterName,
                hp: state.hp,
                maxHp: state.maxHp,
                sp: state.sp,
                maxSp: state.maxSp,
                slots: state.slots,
                activeWeaponIndex: state.activeWeaponIndex,
                levelElapsedMs: state.levelElapsedMs,
                playerSnapshot: state.playerSnapshot,
                activeMonstersSnapshot: state.activeMonstersSnapshot,
                groundDropsSnapshot: state.groundDropsSnapshot,
                // Tavern
                selectedCharacterId: state.selectedCharacterId,
                tavernCleared: state.tavernCleared,
            }),
        }
    )
);
