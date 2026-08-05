import { useGameStore } from '@/store/game-store';
import type { CharacterSpec } from '@/lib/characters';

export class CharacterHud {
    constructor(_scene?: unknown, spec?: CharacterSpec) {
        if (spec) {
            const currentStoreHp = useGameStore.getState().hp;
            const currentStoreSp = useGameStore.getState().sp;
            const initialHp = typeof currentStoreHp === 'number' && currentStoreHp > 0 ? currentStoreHp : spec.hp;
            const initialSp = typeof currentStoreSp === 'number' && currentStoreSp >= 0 && currentStoreHp > 0 ? currentStoreSp : spec.sp;

            useGameStore.getState().setCharacterStats({
                name: spec.name,
                hp: initialHp,
                maxHp: spec.hp,
                sp: initialSp,
                maxSp: spec.sp,
            });
            useGameStore.getState().setWeaponMax(spec.weaponMax ?? 3);
        }
    }

    update(spec: CharacterSpec, hp: number, sp: number): void {
        useGameStore.getState().setCharacterStats({
            name: spec.name,
            hp,
            maxHp: spec.hp,
            sp,
            maxSp: spec.sp,
        });
        useGameStore.getState().setWeaponMax(spec.weaponMax ?? 3);
    }

    setVisible(visible: boolean): void {
        useGameStore.getState().setHubsVisible(visible);
    }

    destroy(): void {
        // No-op for React overlay
    }
}
