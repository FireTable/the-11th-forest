/**
 * src/game/scenes/teleporter.ts
 * --------------------------------------------------------------------------
 * Code-drawn Magic Circle (传送阵) Controller & Visual Renderer.
 *
 * Renders dynamic procedural magic circles using Phaser.Graphics and Tweens:
 *   - Outer rune ring & inner rotating geometry (hexagram / magical star)
 *   - Pulsing magic aura & glowing core
 *   - Sparkle energy particles
 *   - Level clear gating (appears with fade-in after all monsters cleared)
 *   - Interactive Phaser dragging when editor is active
 *   - Proximity detection for player character
 *   - Seamless scene switching to next scene or explicitly target scene
 */

import * as Phaser from 'phaser';

import { DEPTH } from '@/lib/constants';
import { EventBus } from '@/lib/events/bus';
import { fetchLevelIndex } from '@/lib/levels/loader';
import type { Teleporter } from '@/lib/levels/types';
import { resolveAndRestart } from '@/lib/phaser-game';

interface SingleTeleporterView {
    spec: Teleporter;
    graphics: Phaser.GameObjects.Graphics;
    glow: Phaser.GameObjects.Graphics;
    hitZone: Phaser.GameObjects.Zone;
    particles?: Phaser.GameObjects.Particles.ParticleEmitter;
    rotationAngle: number;
    pulseFactor: number;
    appearAlpha: number;
    hasAppeared: boolean;
    isActive: boolean;
}

export class TeleporterController {
    private teleporters: SingleTeleporterView[] = [];
    private isTransitioning = false;
    private activeEditor = false;

    constructor(
        private readonly scene: Phaser.Scene,
        teleporterSpecs: Teleporter[] | undefined,
        private readonly currentSceneId: string,
        private readonly getPlayerPos: () => { x: number; y: number } | null,
        private readonly isClearedGetter: () => boolean = () => true,
    ) {
        const initiallyCleared = this.isClearedGetter();
        if (teleporterSpecs && teleporterSpecs.length > 0) {
            for (const spec of teleporterSpecs) {
                this.createTeleporterView(spec, initiallyCleared);
            }
        }
        this.bindEvents();
    }

    private createTeleporterView(spec: Teleporter, initiallyCleared: boolean): void {
        const r = spec.radius ?? 40;

        // Container for glow and main graphics — placed at top foreground depth
        const glow = this.scene.add.graphics();
        glow.setPosition(spec.x, spec.y);
        glow.setDepth(DEPTH.TELEPORTER_GLOW);

        const graphics = this.scene.add.graphics();
        graphics.setPosition(spec.x, spec.y);
        graphics.setDepth(DEPTH.TELEPORTER_GRAPHICS);

        // Hit zone for Phaser drag interactivity
        const hitZone = this.scene.add.zone(spec.x, spec.y, r * 2, r * 2);
        hitZone.setSize(r * 2, r * 2);
        hitZone.setOrigin(0.5, 0.5);
        hitZone.setDepth(DEPTH.TELEPORTER_HIT_ZONE);

        // Particle emitter for upward energy sparkles
        let particles: Phaser.GameObjects.Particles.ParticleEmitter | undefined;
        try {
            if (!this.scene.textures.exists('teleport-particle')) {
                const canvas = document.createElement('canvas');
                canvas.width = 8;
                canvas.height = 8;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    const grad = ctx.createRadialGradient(4, 4, 0, 4, 4, 4);
                    grad.addColorStop(0, 'rgba(56, 189, 248, 1)');
                    grad.addColorStop(1, 'rgba(56, 189, 248, 0)');
                    ctx.fillStyle = grad;
                    ctx.fillRect(0, 0, 8, 8);
                }
                this.scene.textures.addCanvas('teleport-particle', canvas);
            }

            particles = this.scene.add.particles(spec.x, spec.y, 'teleport-particle', {
                speed: { min: 10, max: 30 },
                angle: { min: 240, max: 300 },
                scale: { start: 1, end: 0 },
                alpha: { start: 0.8, end: 0 },
                lifespan: 1200,
                blendMode: 'ADD',
                frequency: 150,
                emitting: initiallyCleared,
            });
            particles.setDepth(DEPTH.TELEPORTER_PARTICLES);
        } catch {
            // Fallback gracefully if particles unavailable
        }

        const view: SingleTeleporterView = {
            spec,
            graphics,
            glow,
            hitZone,
            particles,
            rotationAngle: 0,
            pulseFactor: 0,
            appearAlpha: initiallyCleared ? 1 : 0,
            hasAppeared: initiallyCleared,
            isActive: false,
        };

        hitZone.on('drag', (_pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => {
            if (!this.activeEditor) return;
            const newX = Math.round(dragX);
            const newY = Math.round(dragY);
            hitZone.setPosition(newX, newY);
            glow.setPosition(newX, newY);
            graphics.setPosition(newX, newY);
            particles?.setPosition(newX, newY);
            spec.x = newX;
            spec.y = newY;
            EventBus.emit('teleporter-updated', {
                id: spec.id,
                x: newX,
                y: newY,
                radius: spec.radius ?? 40,
                spec,
            });
        });

        hitZone.on(
            'wheel',
            (
                _pointer: Phaser.Input.Pointer,
                _deltaX: number,
                deltaY: number,
                _deltaZ: number,
                event: WheelEvent,
            ) => {
                if (!this.activeEditor) return;
                event.stopPropagation?.();
                const step = deltaY > 0 ? -5 : 5;
                const currentR = spec.radius ?? 40;
                const newRadius = Math.max(15, Math.min(300, currentR + step));
                spec.radius = newRadius;
                hitZone.setSize(newRadius * 2, newRadius * 2);
                EventBus.emit('teleporter-updated', {
                    id: spec.id,
                    x: spec.x,
                    y: spec.y,
                    radius: newRadius,
                    spec,
                });
            },
        );

        this.teleporters.push(view);

        // Tween for pulsing aura
        this.scene.tweens.add({
            targets: view,
            pulseFactor: 1,
            duration: 1500,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });
    }

    public setEditorActive(active: boolean): void {
        this.activeEditor = active;
        for (const view of this.teleporters) {
            if (active) {
                view.appearAlpha = 1;
                view.hasAppeared = true;
                view.hitZone.setInteractive({ draggable: true, useHandCursor: true });
            } else {
                view.hitZone.disableInteractive();
            }
        }
    }

    public syncTeleporters(specs: Teleporter[]): void {
        if (!specs) return;
        // 1. Destroy views no longer in specs
        for (let i = this.teleporters.length - 1; i >= 0; i--) {
            const view = this.teleporters[i];
            if (!specs.some((s) => s.id === view.spec.id)) {
                view.graphics.destroy();
                view.glow.destroy();
                view.hitZone.destroy();
                view.particles?.destroy();
                this.teleporters.splice(i, 1);
            }
        }

        // 2. Update existing views or create new ones
        for (const spec of specs) {
            const existing = this.teleporters.find((v) => v.spec.id === spec.id);
            if (existing) {
                existing.spec.x = spec.x;
                existing.spec.y = spec.y;
                existing.spec.radius = spec.radius;
                existing.spec.targetScene = spec.targetScene;
                const r = spec.radius ?? 40;
                existing.hitZone.setPosition(spec.x, spec.y);
                existing.hitZone.setSize(r * 2, r * 2);
                existing.glow.setPosition(spec.x, spec.y);
                existing.graphics.setPosition(spec.x, spec.y);
                existing.particles?.setPosition(spec.x, spec.y);
            } else {
                this.createTeleporterView(spec, true);
                if (this.activeEditor) {
                    const newView = this.teleporters[this.teleporters.length - 1];
                    if (newView) {
                        newView.appearAlpha = 1;
                        newView.hasAppeared = true;
                        newView.hitZone.setInteractive({ draggable: true, useHandCursor: true });
                    }
                }
            }
        }
    }

    private bindEvents(): void {
        const onEditorOpen = (open: unknown) => {
            this.setEditorActive(open === true);
        };
        const onTeleporterChanged = (payload: unknown) => {
            if (!payload || typeof payload !== 'object') return;
            const p = payload as { teleporters?: Teleporter[] };
            if (p.teleporters) {
                this.syncTeleporters(p.teleporters);
            }
        };
        EventBus.on('editor-open', onEditorOpen);
        EventBus.on('teleporter-changed', onTeleporterChanged);
        const unbind = () => {
            EventBus.removeListener('editor-open', onEditorOpen);
            EventBus.removeListener('teleporter-changed', onTeleporterChanged);
        };
        this.scene.events.once('shutdown', unbind);
        this.scene.events.once('destroy', unbind);
    }

    public update(deltaMs: number): void {
        const playerPos = this.getPlayerPos();
        const cleared = this.isClearedGetter();

        for (const view of this.teleporters) {
            // Trigger fade-in animation once level is cleared
            if (cleared && !view.hasAppeared && !this.activeEditor) {
                view.hasAppeared = true;
                if (view.particles) {
                    view.particles.start();
                }
                this.scene.tweens.add({
                    targets: view,
                    appearAlpha: 1,
                    duration: 800,
                    ease: 'Cubic.easeOut',
                });
            }

            // Continuous rotation of inner runes
            view.rotationAngle += (deltaMs / 1000) * 1.2;

            // Sync visual positions & radius with spec in case updated externally from editor panel
            if (this.activeEditor) {
                const r = view.spec.radius ?? 40;
                view.hitZone.setPosition(view.spec.x, view.spec.y);
                view.hitZone.setSize(r * 2, r * 2);
                view.glow.setPosition(view.spec.x, view.spec.y);
                view.graphics.setPosition(view.spec.x, view.spec.y);
                view.particles?.setPosition(view.spec.x, view.spec.y);
            }

            // Draw procedural magic circle
            this.drawMagicCircle(view);

            // Proximity check — only active when teleporter has faded in and editor is not active
            if (
                !playerPos ||
                this.isTransitioning ||
                this.activeEditor ||
                !view.hasAppeared ||
                view.appearAlpha < 0.5
            ) {
                continue;
            }

            const dist = Phaser.Math.Distance.Between(
                playerPos.x,
                playerPos.y,
                view.spec.x,
                view.spec.y,
            );

            const triggerRadius = view.spec.radius ?? 40;
            if (dist <= triggerRadius) {
                view.isActive = true;
                this.triggerSceneTransition(view.spec);
            } else {
                view.isActive = false;
            }
        }
    }

    private drawMagicCircle(view: SingleTeleporterView): void {
        const { graphics, glow, spec, rotationAngle, pulseFactor, appearAlpha, isActive } = view;
        graphics.clear();
        glow.clear();

        if (appearAlpha <= 0.01) return;

        const r = spec.radius ?? 40;
        // Vibrant Arcana Palette: Electric Cyan (0x38bdf8), Arcana Violet (0x818cf8), Emerald Active (0x34d399), Pure White (0xffffff)
        const primaryColor = isActive ? 0x34d399 : 0x38bdf8;
        const secondaryColor = isActive ? 0x6ee7b7 : 0x818cf8;
        const runeColor = isActive ? 0xa7f3d0 : 0xe0e7ff;
        const alpha = (0.7 + pulseFactor * 0.3) * appearAlpha;

        // 1. Dual Soft Radial Glow Aura Matrix
        glow.fillStyle(secondaryColor, (0.08 + pulseFactor * 0.08) * appearAlpha);
        glow.fillCircle(0, 0, r * (1.35 + pulseFactor * 0.12));
        glow.fillStyle(primaryColor, (0.2 + pulseFactor * 0.15) * appearAlpha);
        glow.fillCircle(0, 0, r * (1.05 + pulseFactor * 0.05));

        // 2. Outer Ring & Counter-Rotating Arc Ring
        graphics.lineStyle(3, primaryColor, alpha);
        graphics.strokeCircle(0, 0, r);

        graphics.lineStyle(1.5, secondaryColor, alpha * 0.7);
        graphics.strokeCircle(0, 0, r * 1.1);

        // 3. Concentric Arc Dash Ring
        const arcs = 8;
        graphics.lineStyle(2, runeColor, alpha * 0.85);
        for (let i = 0; i < arcs; i++) {
            const startAngle = (i / arcs) * Math.PI * 2 - rotationAngle * 0.5;
            const endAngle = startAngle + (Math.PI / arcs) * 0.7;
            graphics.beginPath();
            graphics.arc(0, 0, r * 0.88, startAngle, endAngle, false);
            graphics.strokePath();
        }

        // 4. 16 Cardinal & Ordinal Rune Spire Ticks with Diamond Tips
        const ticks = 16;
        for (let i = 0; i < ticks; i++) {
            const angle = (i / ticks) * Math.PI * 2 + rotationAngle * 0.3;
            const isMajor = i % 4 === 0;
            const r1 = r * 0.78;
            const r2 = isMajor ? r * 1.08 : r * 0.98;
            const x1 = Math.cos(angle) * r1;
            const y1 = Math.sin(angle) * r1;
            const x2 = Math.cos(angle) * r2;
            const y2 = Math.sin(angle) * r2;

            graphics.lineStyle(isMajor ? 2 : 1, isMajor ? primaryColor : runeColor, alpha * 0.9);
            graphics.lineBetween(x1, y1, x2, y2);

            // Diamond tip on major spokes
            if (isMajor) {
                const tipX = Math.cos(angle) * (r * 1.12);
                const tipY = Math.sin(angle) * (r * 1.12);
                graphics.fillStyle(primaryColor, alpha);
                graphics.fillCircle(tipX, tipY, 2.5);
            }
        }

        // 5. Dual Interwoven Rotating Hexagram Star (Counter-rotating)
        const innerR1 = r * 0.65;
        const innerR2 = r * 0.45;

        // Outer Hexagram (Clockwise)
        graphics.lineStyle(1.5, primaryColor, alpha * 0.9);
        for (let t = 0; t < 2; t++) {
            graphics.beginPath();
            for (let i = 0; i < 3; i++) {
                const a = rotationAngle + (t * Math.PI) / 3 + (i * Math.PI * 2) / 3;
                const x = Math.cos(a) * innerR1;
                const y = Math.sin(a) * innerR1;
                if (i === 0) graphics.moveTo(x, y);
                else graphics.lineTo(x, y);

                // Vertex sparkle node
                graphics.fillStyle(0xffffff, alpha * 0.9);
                graphics.fillCircle(x, y, 2);
            }
            graphics.closePath();
            graphics.strokePath();
        }

        // Inner Hexagram (Counter-Clockwise)
        graphics.lineStyle(1.5, secondaryColor, alpha * 0.8);
        for (let t = 0; t < 2; t++) {
            graphics.beginPath();
            for (let i = 0; i < 3; i++) {
                const a = -rotationAngle * 0.8 + (t * Math.PI) / 3 + (i * Math.PI * 2) / 3;
                const x = Math.cos(a) * innerR2;
                const y = Math.sin(a) * innerR2;
                if (i === 0) graphics.moveTo(x, y);
                else graphics.lineTo(x, y);
            }
            graphics.closePath();
            graphics.strokePath();
        }

        // 6. Radial Spire Rays emitting from core
        const rays = 8;
        graphics.lineStyle(1, secondaryColor, alpha * (0.3 + pulseFactor * 0.4));
        for (let i = 0; i < rays; i++) {
            const a = (i / rays) * Math.PI * 2 - rotationAngle * 0.4;
            graphics.lineBetween(
                Math.cos(a) * (r * 0.25),
                Math.sin(a) * (r * 0.25),
                Math.cos(a) * (r * 0.78),
                Math.sin(a) * (r * 0.78),
            );
        }

        // 7. Luminous Triple-Layer Core Nexus
        graphics.lineStyle(2, primaryColor, alpha);
        graphics.strokeCircle(0, 0, r * 0.24);

        graphics.fillStyle(primaryColor, alpha * 0.85);
        graphics.fillCircle(0, 0, r * (0.16 + pulseFactor * 0.04));

        graphics.fillStyle(0xffffff, (0.8 + pulseFactor * 0.2) * appearAlpha);
        graphics.fillCircle(0, 0, r * (0.08 + pulseFactor * 0.03));
    }

    private async triggerSceneTransition(spec: Teleporter): Promise<void> {
        if (this.isTransitioning) return;
        this.isTransitioning = true;

        let nextSceneId = spec.targetScene;

        // If targetScene is omitted, resolve next scene from level index manifest
        if (!nextSceneId) {
            try {
                const index = await fetchLevelIndex();
                const currentIdx = index.levels.indexOf(this.currentSceneId);
                if (currentIdx !== -1 && currentIdx + 1 < index.levels.length) {
                    nextSceneId = index.levels[currentIdx + 1];
                } else if (index.levels.length > 0) {
                    nextSceneId = index.levels[0]; // Loop back to first scene if at the end
                }
            } catch (e) {
                console.error('Failed to resolve next scene from index:', e);
            }
        }

        if (!nextSceneId) {
            nextSceneId = this.currentSceneId; // Fallback to current scene if none found
        }

        // Camera fade out and restart scene
        this.scene.cameras.main.fadeOut(400, 0, 0, 0);

        this.scene.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
            void resolveAndRestart(nextSceneId!);
        });
    }

    public destroy(): void {
        for (const view of this.teleporters) {
            view.graphics.destroy();
            view.glow.destroy();
            view.hitZone.destroy();
            view.particles?.destroy();
        }
        this.teleporters = [];
    }
}
