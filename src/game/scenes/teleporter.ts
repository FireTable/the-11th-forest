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

import { SFX_EVENT } from '@/lib/constants';
import { EventBus } from '@/lib/events/bus';
import { fetchLevelIndex } from '@/lib/levels/loader';
import type { Teleporter } from '@/lib/levels/types';
import { resolveAndRestart } from '@/lib/phaser-game';
import { useGameStore } from '@/store/game-store';

interface SingleTeleporterView {
    spec: Teleporter;
    graphics: Phaser.GameObjects.Graphics;
    glow: Phaser.GameObjects.Graphics;
    /** Drawn beneath the static glow + main rings; redrawn every frame. */
    waveGlow: Phaser.GameObjects.Graphics;
    hitZone: Phaser.GameObjects.Zone;
    particles?: Phaser.GameObjects.Particles.ParticleEmitter;
    rotationAngle: number;
    pulseFactor: number;
    appearAlpha: number;
    hasAppeared: boolean;
    isActive: boolean;
    /** Outward-shockwave rings, in ms since spawn. Capped to MAX_WAVES. */
    waves: number[];
    /** ms-since-scene-start when the next wave should spawn. */
    nextWaveAt: number;
    /** Lerped display colors — start at idle targets, drift toward active. */
    colors: { primary: number; secondary: number; rune: number };
    /**
     * No next scene to jump to. The teleporter renders grey, never
     * triggers — there's no point letting the player walk into it.
     */
    disabled: boolean;
}

/**
 * Module-level handoff for the just-teleported-from spec id. Written
 * synchronously by `triggerSceneTransition` BEFORE `restartSceneWith`
 * adds the new scene, then read once by the new controller's
 * constructor. Cleared on read. The window is short (microseconds in
 * practice) but the value is intentionally not on the game store — it
 * would persist across page reloads and block teleporters forever.
 */
let lastTriggeredFromId: string | null = null;
export function setLastTriggeredFromId(id: string | null): void {
    lastTriggeredFromId = id;
}

export class TeleporterController {
    private teleporters: SingleTeleporterView[] = [];
    private isTransitioning = false;
    private activeEditor = false;
    /**
     * Spec ids the player just arrived through — these are ignored for
     * the trigger check until the player physically walks out of their
     * radius. Prevents the "step off the portal, immediately re-enter
     * the same portal" loop when the new scene's spawn lands on top
     * of the same teleporter (or its reverse).
     */
    private readonly cooldownIds: Set<string> = new Set();

    constructor(
        private readonly scene: Phaser.Scene,
        teleporterSpecs: Teleporter[] | undefined,
        private readonly currentSceneId: string,
        private readonly getPlayerPos: () => { x: number; y: number } | null,
        private readonly isClearedGetter: () => boolean = () => true,
    ) {
        if (lastTriggeredFromId !== null) {
            this.cooldownIds.add(lastTriggeredFromId);
            lastTriggeredFromId = null;
        }
        const initiallyCleared = this.isClearedGetter();
        if (teleporterSpecs && teleporterSpecs.length > 0) {
            for (const spec of teleporterSpecs) {
                this.createTeleporterView(spec, initiallyCleared);
                // Disabled flag is set async after the index resolves —
                // until then the view defaults to enabled (false), which
                // matches the no-end-of-list case and is what we want
                // for the rare network-failure case anyway.
                void TeleporterController.resolveNextScene(spec, this.currentSceneId).then(
                    (next) => {
                        const view = this.teleporters[this.teleporters.length - 1];
                        if (!view) return;
                        view.disabled = next === null;
                        if (view.disabled) {
                            // Stop the energy sparkles so the portal
                            // visibly goes dormant when there's no
                            // destination to send the player to.
                            view.particles?.stop();
                        }
                    },
                );
            }
        }
        this.bindEvents();
    }

    /**
     * Resolve the destination scene id, with the same fallback rules as
     * `triggerSceneTransition`. Returns null at end-of-list — meaning
     * "this teleporter has nowhere to send the player", which the view
     * layer reads as `disabled: true` (grey, no trigger).
     */
    private static async resolveNextScene(
        spec: Teleporter,
        currentSceneId: string,
    ): Promise<string | null> {
        if (spec.targetScene) return spec.targetScene;
        try {
            const index = await fetchLevelIndex();
            const currentIdx = index.levels.indexOf(currentSceneId);
            if (currentIdx !== -1 && currentIdx + 1 < index.levels.length) {
                return index.levels[currentIdx + 1];
            }
        } catch (e) {
            console.error('Failed to resolve next scene from index:', e);
        }
        return null;
    }

    private createTeleporterView(spec: Teleporter, initiallyCleared: boolean): void {
        const r = spec.radius ?? 40;

        // Container for glow and main graphics — placed at top foreground depth
        const glow = this.scene.add.graphics();
        // Y-sort the whole teleporter so the player can walk in front
        // of the lower half and behind the upper half, like a real
        // ground decal. Depth = spec.y (the portal's center y in image
        // pixel space), which lives in the same range characters use
        // for their flat-depth slot.
        const teleporterDepth = Math.round(spec.y);

        glow.setPosition(spec.x, spec.y);
        glow.setDepth(teleporterDepth - 1);

        // Outward shockwave rings — separate Graphics, drawn every frame,
        // sits behind the static glow so the magic-circle stays crisp.
        const waveGlow = this.scene.add.graphics();
        waveGlow.setPosition(spec.x, spec.y);
        waveGlow.setDepth(teleporterDepth - 2);

        const graphics = this.scene.add.graphics();
        graphics.setPosition(spec.x, spec.y);
        graphics.setDepth(teleporterDepth);

        // Hit zone for Phaser drag interactivity
        const hitZone = this.scene.add.zone(spec.x, spec.y, r * 2, r * 2);
        hitZone.setSize(r * 2, r * 2);
        hitZone.setOrigin(0.5, 0.5);
        hitZone.setDepth(teleporterDepth);

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
            particles.setDepth(teleporterDepth + 1);
        } catch {
            // Fallback gracefully if particles unavailable
        }

        const view: SingleTeleporterView = {
            spec,
            graphics,
            glow,
            waveGlow,
            hitZone,
            particles,
            rotationAngle: 0,
            pulseFactor: 0,
            appearAlpha: initiallyCleared ? 1 : 0,
            disabled: false,
            hasAppeared: initiallyCleared,
            isActive: false,
            waves: [],
            // Stagger the first wave per-view so multiple teleporters
            // don't all pulse on the same frame.
            nextWaveAt: this.scene.time.now + 600 + Math.random() * 600,
            // Idle palette on creation so the very first frame already
            // matches the pre-lerp baseline.
            colors: { primary: 0x38bdf8, secondary: 0x818cf8, rune: 0xe0e7ff },
        };

        hitZone.on('drag', (_pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => {
            if (!this.activeEditor) return;
            const newX = Math.round(dragX);
            const newY = Math.round(dragY);
            hitZone.setPosition(newX, newY);
            glow.setPosition(newX, newY);
            graphics.setPosition(newX, newY);
            waveGlow.setPosition(newX, newY);
            particles?.setPosition(newX, newY);
            spec.x = newX;
            spec.y = newY;
            this.applyYsortDepth(view);
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
                existing.waveGlow.setPosition(spec.x, spec.y);
                this.applyYsortDepth(existing);
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
        const now = this.scene.time.now;
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

            // Outward shockwave rings — spawn at idle/active cadence,
            // age out by lifetime. Each wave is just a timestamp; the
            // radius + alpha are derived in drawWaves() from how long
            // it's been alive.
            this.advanceWaves(view, now);
            // Color drift toward the active palette when the player
            // steps into the trigger. Done before draw so the rings,
            // runes and waves render the same frame in the new hue.
            this.advanceColors(view, deltaMs, view.isActive);

            // Sync visual positions & radius with spec in case updated externally from editor panel
            if (this.activeEditor) {
                const r = view.spec.radius ?? 40;
                view.hitZone.setPosition(view.spec.x, view.spec.y);
                view.hitZone.setSize(r * 2, r * 2);
                view.glow.setPosition(view.spec.x, view.spec.y);
                view.waveGlow.setPosition(view.spec.x, view.spec.y);
                view.graphics.setPosition(view.spec.x, view.spec.y);
                view.particles?.setPosition(view.spec.x, view.spec.y);
                this.applyYsortDepth(view);
            }

            // Draw procedural magic circle
            this.drawMagicCircle(view);
            this.drawWaves(view);

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

            // Disabled (no next scene) — never triggers, just sits grey.
            if (view.disabled) {
                view.isActive = false;
                continue;
            }

            const dist = Phaser.Math.Distance.Between(
                playerPos.x,
                playerPos.y,
                view.spec.x,
                view.spec.y,
            );

            const triggerRadius = view.spec.radius ?? 40;

            // Cooldown: the spec id the player just arrived through is
            // ignored while the player stays inside its radius. As soon
            // as they walk out, the cooldown releases and a future
            // re-entry can re-trigger normally.
            const isInRadius = dist <= triggerRadius;
            if (view.spec.id && this.cooldownIds.has(view.spec.id)) {
                if (!isInRadius) {
                    this.cooldownIds.delete(view.spec.id);
                }
                view.isActive = false;
                continue;
            }

            if (isInRadius) {
                view.isActive = true;
                this.triggerSceneTransition(view.spec);
            } else {
                view.isActive = false;
            }
        }
    }

    private drawMagicCircle(view: SingleTeleporterView): void {
        const { graphics, glow, spec, rotationAngle, pulseFactor, appearAlpha } = view;
        graphics.clear();
        glow.clear();

        if (appearAlpha <= 0.01) return;

        const r = spec.radius ?? 40;
        // Colors drift between the idle and active palette each frame —
        // see `advanceColors` in update(). Reading from `view.colors`
        // here, not picking fresh hex from `isActive`, is what makes
        // the transition a gradient instead of a hard cut. A disabled
        // teleporter (no next scene) overrides the palette to grey so
        // the player can tell at a glance it's not wired up.
        const primaryColor = view.disabled ? 0x6b7280 : view.colors.primary;
        const secondaryColor = view.disabled ? 0x9ca3af : view.colors.secondary;
        const runeColor = view.disabled ? 0xd1d5db : view.colors.rune;
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

        // Handoff BEFORE the scene swap — the next TeleporterController's
        // constructor reads this and adds the id to its cooldown set.
        // The id is the *source* teleporter's id, not the destination's.
        if (spec.id) {
            setLastTriggeredFromId(spec.id);
        }

        let nextSceneId = spec.targetScene;

        // If targetScene is omitted, resolve next scene from level index manifest.
        // No loop-back at the end — null means "no next scene" and the
        // teleporter is rendered grey (see `resolveNextScene` for the
        // version called at view-creation time).
        if (!nextSceneId) {
            try {
                const index = await fetchLevelIndex();
                const currentIdx = index.levels.indexOf(this.currentSceneId);
                if (currentIdx !== -1 && currentIdx + 1 < index.levels.length) {
                    nextSceneId = index.levels[currentIdx + 1];
                }
            } catch (e) {
                console.error('Failed to resolve next scene from index:', e);
            }
        }

        if (!nextSceneId) {
            nextSceneId = this.currentSceneId; // Fallback to current scene if none found
        }

        // Update persistent level store to next scene ID and reset level entity snapshots
        useGameStore.getState().setCurrentLevelId(nextSceneId);
        useGameStore.getState().setEntitySnapshots({ player: undefined, monsters: undefined, drops: undefined });

        // AudioController subscribes to `sfx:*` globally — emit the new
        // id and the portal-ignition chime plays under the fade. We
        // emit here, before fadeOut, so the SFX instance is spawned
        // while the old scene is still the active one (sound objects
        // are bound to the scene that creates them).
        EventBus.emit(SFX_EVENT('teleporter-activate'));

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
            view.waveGlow.destroy();
            view.hitZone.destroy();
            view.particles?.destroy();
        }
        this.teleporters = [];
    }

    // ─── Outward shockwave rings ─────────────────────────────────────────
    // Each wave is a timestamp; radius / alpha / line width are derived
    // from `now - spawnedAt` in drawWaves(). Idle: spawn every 1600ms.
    // Active (player inside the trigger radius): 700ms, so the ring
    // cadence signals "ready to use".
    private static readonly WAVE_LIFETIME_MS = 1400;
    private static readonly WAVE_INTERVAL_IDLE_MS = 1600;
    private static readonly WAVE_INTERVAL_ACTIVE_MS = 700;
    private static readonly WAVE_MAX = 3;
    private static readonly WAVE_RADIUS_MAX_MULT = 1.7;
    /** Color lerp rate (per second). 4 → ~600ms to traverse the gap. */
    private static readonly COLOR_LERP_PER_SEC = 4;
    private static readonly COLORS_IDLE = {
        primary: 0x38bdf8,
        secondary: 0x818cf8,
        rune: 0xe0e7ff,
    } as const;
    private static readonly COLORS_ACTIVE = {
        primary: 0x34d399,
        secondary: 0x6ee7b7,
        rune: 0xa7f3d0,
    } as const;

    /** Linear interpolation of 24-bit RGB at rate `r` per second. */
    private static lerpRgb(from: number, to: number, dtMs: number): number {
        const t = 1 - Math.exp(-TeleporterController.COLOR_LERP_PER_SEC * (dtMs / 1000));
        const a = (from >> 16) & 0xff, b = (to >> 16) & 0xff;
        const g = (from >> 8) & 0xff, h = (to >> 8) & 0xff;
        const bl = from & 0xff, br = to & 0xff;
        return (
            (Math.round(a + (b - a) * t) << 16) |
            (Math.round(g + (h - g) * t) << 8) |
            Math.round(bl + (br - bl) * t)
        );
    }

    /**
     * Re-derive every layered depth on the view from `spec.y` so the
     * teleporter stays Y-sorted after the editor drags it. Caller must
     * have updated `spec.x` / `spec.y` first.
     */
    private applyYsortDepth(view: SingleTeleporterView): void {
        const d = Math.round(view.spec.y);
        view.waveGlow.setDepth(d - 2);
        view.glow.setDepth(d - 1);
        view.graphics.setDepth(d);
        view.hitZone.setDepth(d);
        view.particles?.setDepth(d + 1);
    }

    private advanceColors(view: SingleTeleporterView, dtMs: number, isActive: boolean): void {
        const target = isActive
            ? TeleporterController.COLORS_ACTIVE
            : TeleporterController.COLORS_IDLE;
        view.colors = {
            primary: TeleporterController.lerpRgb(view.colors.primary, target.primary, dtMs),
            secondary: TeleporterController.lerpRgb(view.colors.secondary, target.secondary, dtMs),
            rune: TeleporterController.lerpRgb(view.colors.rune, target.rune, dtMs),
        };
    }

    private advanceWaves(view: SingleTeleporterView, now: number): void {
        // Drop expired waves
        view.waves = view.waves.filter(
            (t) => now - t < TeleporterController.WAVE_LIFETIME_MS,
        );
        // Spawn?
        const interval = view.isActive
            ? TeleporterController.WAVE_INTERVAL_ACTIVE_MS
            : TeleporterController.WAVE_INTERVAL_IDLE_MS;
        if (now >= view.nextWaveAt && view.waves.length < TeleporterController.WAVE_MAX) {
            view.waves.push(now);
            // Stagger by interval, not lifetime, so the cadence stays
            // steady rather than waiting until the last wave dies.
            view.nextWaveAt = now + interval;
        }
    }

    private drawWaves(view: SingleTeleporterView): void {
        const g = view.waveGlow;
        g.clear();
        if (view.appearAlpha <= 0.01) return;
        const r = view.spec.radius ?? 40;
        const maxR = r * TeleporterController.WAVE_RADIUS_MAX_MULT;
        const lifetime = TeleporterController.WAVE_LIFETIME_MS;
        const now = this.scene.time.now;
        const primaryColor = view.disabled ? 0x6b7280 : view.colors.primary;
        const secondaryColor = view.disabled ? 0x9ca3af : view.colors.secondary;
        for (const t of view.waves) {
            const age = now - t;
            const u = Math.min(1, age / lifetime);
            // Ease-out cubic so waves start fast, slow toward the edge
            const eased = 1 - Math.pow(1 - u, 3);
            const radius = r + (maxR - r) * eased;
            // Alpha dies fast; line thins as it spreads
            const alpha = (0.6 * (1 - u * u)) * view.appearAlpha;
            const width = 2.5 * (1 - u * 0.7);
            g.lineStyle(width, primaryColor, alpha);
            g.strokeCircle(0, 0, radius);
            g.lineStyle(width * 0.6, secondaryColor, alpha * 0.5);
            g.strokeCircle(0, 0, radius + 2);
        }
    }
}
