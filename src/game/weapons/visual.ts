/**
 * src/game/weapons/visual.ts
 * --------------------------------------------------------------------------
 * WeaponVisualController: Handles Brotato-style floating weapon attachments,
 * aiming rotations, dynamic depth layer sorting, recoil procedural tweening,
 * melee arc swings, and laser beam rendering.
 */

import type * as Phaser from 'phaser';
import type { WeaponSpec } from '@/lib/weapons';

export class WeaponVisualController {
    private readonly scene: Phaser.Scene;
    private sprite: Phaser.GameObjects.Sprite | null = null;
    private currentSpec: WeaponSpec | null = null;

    // Procedural Animation State
    private recoilOffset = 0;
    private swingOffsetAngle = 0;
    private recoilTween: Phaser.Tweens.Tween | null = null;
    private swingTween: Phaser.Tweens.Tween | null = null;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
    }

    /** Set or change active weapon spec to display. */
    public setWeapon(spec: WeaponSpec): void {
        this.currentSpec = spec;
        const textureKey = spec.visual?.texture;

        if (this.sprite) {
            this.sprite.destroy();
            this.sprite = null;
        }

        if (textureKey && this.scene.textures.exists(textureKey)) {
            this.sprite = this.scene.add.sprite(0, 0, textureKey);
            const anchor = spec.visual?.anchor ?? [0.2, 0.5];
            const scale = spec.visual?.scale ?? 0.16;
            this.sprite.setOrigin(anchor[0], anchor[1]);
            this.sprite.setScale(scale);
        }
    }

    /**
     * Update weapon position, angle, orientation, and depth relative to player character.
     * @param playerX Character center X
     * @param playerY Character center Y
     * @param feetY Character feet depth (Y-sorted)
     * @param aimAngle Angle in radians toward mouse/target
     */
    public update(playerX: number, playerY: number, feetY: number, aimAngle: number): void {
        if (!this.sprite || !this.currentSpec) return;

        const orbitRadius = this.currentSpec.visual?.orbitRadius ?? 16;

        // 1. Calculate Orbit Position around player center
        const totalDist = orbitRadius - this.recoilOffset;
        const weaponX = playerX + Math.cos(aimAngle) * totalDist;
        const weaponY = playerY + Math.sin(aimAngle) * totalDist;

        this.sprite.setPosition(weaponX, weaponY);

        // 2. Aim Rotation, Spec Rotation Offset, & Swing Offset
        const rotOffsetRad = ((this.currentSpec.visual?.rotationOffset ?? 0) * Math.PI) / 180;
        const finalAngle = aimAngle + rotOffsetRad + (this.swingOffsetAngle * Math.PI) / 180;
        this.sprite.setRotation(finalAngle);

        // 3. Flip Y depending on aiming side (Left vs Right)
        const cosAngle = Math.cos(aimAngle);
        if (cosAngle < 0) {
            this.sprite.setFlipY(true);
        } else {
            this.sprite.setFlipY(false);
        }

        // 4. Dynamic Depth Sorting relative to Character Feet Y
        // Aiming North/Up = Behind player (feetY - 1)
        // Aiming South/Sides = In front of player (feetY + 10)
        const sinAngle = Math.sin(aimAngle);
        if (sinAngle < -0.3) {
            this.sprite.setDepth(feetY - 1);
        } else {
            this.sprite.setDepth(feetY + 10);
        }
    }

    /** Trigger procedural recoil impulse when firing a ranged weapon. */
    public triggerRecoil(): void {
        if (!this.currentSpec || !this.scene) return;

        const distance = this.currentSpec.visual?.recoilDistance ?? 6;
        const duration = this.currentSpec.visual?.recoilDuration ?? 80;

        if (this.recoilTween) {
            this.recoilTween.stop();
        }

        this.recoilOffset = distance;
        this.recoilTween = this.scene.tweens.add({
            targets: this,
            recoilOffset: 0,
            duration: duration,
            ease: 'Cubic.out',
        });
    }

    /** Trigger procedural melee swing arc animation. */
    public triggerSwing(): void {
        if (!this.currentSpec || !this.scene) return;

        const swingAngle = this.currentSpec.visual?.swingAngle ?? 120;
        const halfSwing = swingAngle / 2;

        if (this.swingTween) {
            this.swingTween.stop();
        }

        this.swingOffsetAngle = -halfSwing;
        this.swingTween = this.scene.tweens.add({
            targets: this,
            swingOffsetAngle: halfSwing,
            duration: 120,
            ease: 'Quad.out',
            onComplete: () => {
                this.swingOffsetAngle = 0;
            },
        });
    }

    /** Hide or show the weapon sprite. */
    public setVisible(visible: boolean): void {
        if (this.sprite) {
            this.sprite.setVisible(visible);
        }
    }

    /** Get exact world position of the weapon muzzle tip based on rotation and muzzleOffset. */
    public getMuzzlePosition(fallbackX: number, fallbackY: number): { x: number; y: number } {
        if (!this.sprite || !this.currentSpec) return { x: fallbackX, y: fallbackY };

        const scale = this.currentSpec.visual?.scale ?? 0.16;
        const anchor = this.currentSpec.visual?.anchor ?? [0.2, 0.5];
        // Total unscaled pixel offset along the weapon length from anchor point to barrel tip
        const rawOffset = (this.currentSpec.visual?.muzzleOffset ?? 400) * (1 - anchor[0]);
        const muzzleDistance = rawOffset * scale;

        const rotation = this.sprite.rotation;
        return {
            x: this.sprite.x + Math.cos(rotation) * muzzleDistance,
            y: this.sprite.y + Math.sin(rotation) * muzzleDistance,
        };
    }

    /** Clean up resources on destruction. */
    public destroy(): void {
        if (this.recoilTween) this.recoilTween.stop();
        if (this.swingTween) this.swingTween.stop();
        if (this.sprite) {
            this.sprite.destroy();
            this.sprite = null;
        }
    }
}
