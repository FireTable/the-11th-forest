import { useGameStore } from '@/store/game-store';
import type { CharacterSpec } from '@/lib/characters';

export class CharacterHud {
    constructor(_scene?: unknown, spec?: CharacterSpec) {
        if (spec) {
            useGameStore.getState().setCharacterStats({
                name: spec.name,
                hp: spec.hp,
                maxHp: spec.hp,
                sp: spec.sp,
                maxSp: spec.sp,
            });
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
    }

    setVisible(visible: boolean): void {
        useGameStore.getState().setHubsVisible(visible);
    }

    destroy(): void {
        // No-op for React overlay
    }
}
