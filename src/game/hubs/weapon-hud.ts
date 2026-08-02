import { useGameStore } from '@/store/game-store';
import type { WeaponController } from '@/game/weapons/logic';

export class WeaponHud {
    constructor(_scene?: unknown, weapons?: WeaponController) {
        if (weapons) {
            this.draw(weapons, 0);
        }
    }

    draw(weapons: WeaponController, time: number): void {
        const activeIdx = weapons.getActiveIndex();
        const active = weapons.getActive();
        const ammo = weapons.getAmmo();
        const max = weapons.getMaxAmmo();
        const isReloading = weapons.isReloading();
        const reloadProgress = isReloading ? weapons.getReloadProgress(time) : 0;

        const slotCount = weapons.getSlotCount();
        const slots = [];
        for (let i = 0; i < slotCount; i++) {
            const slotState = weapons.getSlot(i);
            slots.push({
                id: slotState.spec.id ?? `slot-${i}`,
                name: slotState.spec.name,
                ammo: slotState.ammo,
                clipSize: slotState.spec.clipSize ?? 1,
                texture: slotState.spec.visual?.texture,
            });
        }

        useGameStore.getState().setWeaponStats({
            activeIndex: activeIdx,
            name: active.name,
            ammo,
            maxAmmo: max,
            isReloading,
            reloadProgress,
            slots,
        });
    }

    setVisible(visible: boolean): void {
        useGameStore.getState().setHubsVisible(visible);
    }

    destroy(): void {
        // No-op
    }
}
