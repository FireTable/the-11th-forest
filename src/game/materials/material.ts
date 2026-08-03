/**
 * src/game/materials/material.ts
 * --------------------------------------------------------------------------
 * Material Manager — Phaser scene component responsible for loading,
 * rendering, and enabling interactive dragging for placed level materials.
 */

import * as Phaser from 'phaser';

import type { Level, PlacedMaterial } from '@/lib/levels/types';
import { EventBus } from '@/lib/events/bus';

import { calculateMaterialDepth } from './logic';

export class MaterialManager {
    private readonly scene: Phaser.Scene;
    private readonly level: Level;
    private readonly sprites: Map<string, Phaser.GameObjects.Sprite> = new Map();
    private readonly selectionBox: Phaser.GameObjects.Graphics;
    private activeEditor = false;
    private selectedId: string | null = null;

    constructor(scene: Phaser.Scene, level: Level) {
        this.scene = scene;
        this.level = level;

        this.selectionBox = scene.add.graphics();
        this.selectionBox.setDepth(15000); // Always above materials for debug selection
        this.selectionBox.setVisible(false);

        this.initMaterials();
        this.bindEvents();
    }

    /** Ensure all textures for placed materials are loaded into Phaser texture manager. */
    static preloadMaterials(scene: Phaser.Scene, materials?: PlacedMaterial[]): void {
        if (!materials) return;
        for (const mat of materials) {
            if (!scene.textures.exists(mat.texture)) {
                scene.load.image(mat.texture, mat.texture);
            }
        }
    }

    /** Update interactive drag state when editor toggles. */
    setEditorActive(active: boolean): void {
        this.activeEditor = active;
        for (const sprite of this.sprites.values()) {
            if (active) {
                sprite.setInteractive({ draggable: true });
            } else {
                sprite.disableInteractive();
            }
        }
        if (!active) {
            this.selectMaterial(null);
        }
    }

    /** Dynamically add a new material instance to the scene (e.g. from editor click). */
    addMaterial(mat: PlacedMaterial): void {
        const existingIdx = this.level.materials?.findIndex((m) => m.id === mat.id) ?? -1;
        if (!this.level.materials) {
            this.level.materials = [];
        }
        if (existingIdx < 0) {
            this.level.materials.push(mat);
        } else {
            this.level.materials[existingIdx] = mat;
        }

        if (this.scene.textures.exists(mat.texture)) {
            this.spawnMaterialSprite(mat);
            this.selectMaterial(mat.id);
        } else {
            this.scene.load.image(mat.texture, mat.texture);
            this.scene.load.once('complete', () => {
                this.spawnMaterialSprite(mat);
                this.selectMaterial(mat.id);
            });
            this.scene.load.start();
        }
    }

    /** Select a material and draw a cyan selection box around it. */
    selectMaterial(id: string | null): void {
        this.selectedId = id;
        this.drawSelectionBox();
    }

    /** Update a material's properties (mode, scale, rotation, flipX, flipY, depthOffset). */
    updateMaterial(mat: PlacedMaterial): void {
        const sprite = this.sprites.get(mat.id);
        if (!sprite) return;
        const depth = calculateMaterialDepth(mat.mode, mat.y, mat.depthOffset);
        sprite.setDepth(depth);
        sprite.setPosition(mat.x, mat.y);
        sprite.setScale(mat.scale ?? 1);
        sprite.setAngle(mat.rotation ?? 0);
        sprite.setFlipX(mat.flipX ?? false);
        sprite.setFlipY(mat.flipY ?? false);
        this.drawSelectionBox();
    }

    /** Remove a material instance from scene and level data. */
    removeMaterial(id: string): void {
        const sprite = this.sprites.get(id);
        if (sprite) {
            sprite.destroy();
            this.sprites.delete(id);
        }
        if (this.level.materials) {
            this.level.materials = this.level.materials.filter((m) => m.id !== id);
        }
        if (this.selectedId === id) {
            this.selectMaterial(null);
            EventBus.emit('material-selected', null);
        }
    }

    /** Per-frame update loop for Y-sort dynamic depth & selection box position. */
    update(): void {
        if (!this.level.materials) return;
        for (const mat of this.level.materials) {
            if ((mat.mode ?? 'y-sort') === 'y-sort') {
                const sprite = this.sprites.get(mat.id);
                if (sprite) {
                    sprite.setDepth(calculateMaterialDepth('y-sort', mat.y, mat.depthOffset));
                }
            }
        }
        this.drawSelectionBox();
    }

    destroy(): void {
        for (const sprite of this.sprites.values()) {
            sprite.destroy();
        }
        this.sprites.clear();
        this.selectionBox.destroy();
    }

    // ─── Private Helpers ──────────────────────────────────────────────────

    private drawSelectionBox(): void {
        this.selectionBox.clear();
        if (!this.activeEditor || !this.selectedId) {
            this.selectionBox.setVisible(false);
            return;
        }

        const sprite = this.sprites.get(this.selectedId);
        if (!sprite) {
            this.selectionBox.setVisible(false);
            return;
        }

        const bounds = sprite.getBounds();
        this.selectionBox.setVisible(true);
        // Draw cyan selection rectangle around the sprite bounds
        this.selectionBox.lineStyle(2, 0x06b6d4, 1);
        this.selectionBox.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
    }

    private initMaterials(): void {
        if (!this.level.materials) return;
        for (const mat of this.level.materials) {
            this.spawnMaterialSprite(mat);
        }
    }

    private spawnMaterialSprite(mat: PlacedMaterial): void {
        if (this.sprites.has(mat.id)) return;

        const sprite = this.scene.add.sprite(mat.x, mat.y, mat.texture);
        sprite.setOrigin(0.5, 1.0); // Anchor at bottom-center for Y-sorting feet
        sprite.setScale(mat.scale ?? 1);
        sprite.setAngle(mat.rotation ?? 0);
        sprite.setFlipX(mat.flipX ?? false);
        sprite.setFlipY(mat.flipY ?? false);
        const depth = calculateMaterialDepth(mat.mode, mat.y, mat.depthOffset);
        sprite.setDepth(depth);

        if (this.activeEditor) {
            sprite.setInteractive({ draggable: true });
        }

        sprite.on('drag', (_pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => {
            if (!this.activeEditor) return;
            const newX = Math.round(dragX);
            const newY = Math.round(dragY);
            sprite.setPosition(newX, newY);
            mat.x = newX;
            mat.y = newY;
            this.drawSelectionBox();
            EventBus.emit('material-updated', mat);
        });

        sprite.on('pointerdown', () => {
            if (!this.activeEditor) return;
            this.selectMaterial(mat.id);
            EventBus.emit('material-selected', mat);
        });

        this.sprites.set(mat.id, sprite);
    }

    private bindEvents(): void {
        const onEditorOpen = (open: unknown) => {
            this.setEditorActive(open === true);
        };
        // Material drag is enabled only while the editor's Materials
        // sub-tab is the active view — picking Walls or Monsters must
        // not let the user accidentally move material sprites around.
        // The panel emits a fresh boolean whenever open / topTab /
        // sceneSubTab changes, so this listener tracks it directly.
        const onMaterialTabActive = (active: unknown) => {
            this.setEditorActive(active === true);
        };
        const onAdd = (mat: unknown) => {
            if (mat) this.addMaterial(mat as PlacedMaterial);
        };
        const onUpdate = (mat: unknown) => {
            if (mat) this.updateMaterial(mat as PlacedMaterial);
        };
        const onDelete = (id: unknown) => {
            if (typeof id === 'string') this.removeMaterial(id);
        };

        const onSelect = (mat: unknown) => {
            if (!mat) {
                this.selectMaterial(null);
            } else if (typeof mat === 'string') {
                this.selectMaterial(mat);
            } else if (typeof (mat as any).id === 'string') {
                this.selectMaterial((mat as any).id);
            }
        };

        EventBus.on('editor-open', onEditorOpen);
        EventBus.on('editor-material-tab-active', onMaterialTabActive);
        EventBus.on('material-add', onAdd);
        EventBus.on('material-select-id', onSelect);
        EventBus.on('material-update-props', onUpdate);
        EventBus.on('material-delete', onDelete);

        const unbind = () => {
            EventBus.removeListener('editor-open', onEditorOpen);
            EventBus.removeListener('editor-material-tab-active', onMaterialTabActive);
            EventBus.removeListener('material-add', onAdd);
            EventBus.removeListener('material-select-id', onSelect);
            EventBus.removeListener('material-update-props', onUpdate);
            EventBus.removeListener('material-delete', onDelete);
        };
        // Game teardown (HMR / React unmount) emits `destroy` without `shutdown`,
        // so both must unbind or this manager leaks onto the bus with dead sprites.
        this.scene.events.once('shutdown', unbind);
        this.scene.events.once('destroy', unbind);
    }
}
