import { create } from 'zustand';

export interface WeaponSlotData {
    id: string;
    name: string;
    ammo: number;
    clipSize: number;
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

    // Level Status
    levelTitle: string;
    /** Elapsed milliseconds since the current level started. Driven by
     *  the scene's update() loop; HUDs read it to display MM:SS. */
    levelElapsedMs: number;

    // Visibility
    hubsVisible: boolean;

    // Setters
    setLevelTitle: (title: string) => void;
    setLevelElapsedMs: (ms: number) => void;
    setCharacterStats: (stats: { name?: string; hp: number; maxHp: number; sp: number; maxSp: number }) => void;
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
}

export const useGameStore = create<GameUIState>((set) => ({
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
    slots: [],

    levelTitle: '',
    levelElapsedMs: 0,

    hubsVisible: true,

    setLevelTitle: (title) => set({ levelTitle: title }),
    setLevelElapsedMs: (ms) => set({ levelElapsedMs: ms }),

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
}));
