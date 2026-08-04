/**
 * src/game/scenes/tavern-controller.ts
 * --------------------------------------------------------------------------
 * Two-phase controller for the Forest Tavern scene.
 *
 *   Phase 1 — Selection
 *     All characters from allCharacters are spawned as NPC idle sprites at
 *     their npcSpawns positions. Player cycles A/D or clicks; E/Enter
 *     confirms. The selected spec is persisted to the store and handed to
 *     `onConfirm`.
 *
 *   Phase 2 — Weapon pickup
 *     The player-controlled character lives normally. Weapon pickups are
 *     counted here (cap = WEAPON_MAX). Emits 'tavern-focus' updates via
 *     EventBus so the React TavernHud stays in sync.
 */

import * as Phaser from 'phaser';

import { EventBus } from '@/lib/events/bus';
import type { CharacterSpec } from '@/lib/characters';
import type { Level } from '@/lib/levels/types';
import type { WeaponSpec } from '@/lib/weapons';
import { animKey, textureKey } from '@/game/characters/keys';
import type { SceneAssets } from './scene';
import { useGameStore } from '@/store/game-store';

// ─── Public types ─────────────────────────────────────────────────────────

export interface TavernNpcEntry {
    spec: CharacterSpec;
    sprite: Phaser.GameObjects.Sprite;
    shadow: Phaser.GameObjects.Ellipse;
    x: number;
    y: number;
}

type Phase = 'selection' | 'pickup';

export interface TavernFocusPayload {
    name: string;
    hp: number;
    sp: number;
    moveSpeed: number;
    stats?: { strength: number; agility: number; vitality: number; spirit: number };
    phase: Phase;
    weaponCount: number;
    weaponMax: number;
    /**
     * Viewport-pixel position of the focused NPC's head (for phase 1 only).
     * `undefined` in phase 2 — the HUD falls back to its default anchor.
     */
    viewportX?: number;
    viewportY?: number;
    /**
     * Per-frame bobbing offset of the arrow in viewport pixels (phase 1
     * only). The HUD reads this to ride the arrow's float animation.
     */
    arrowOffsetY?: number;
    /**
     * F-key long-press progress (0..1). `undefined` when not holding.
     * The HUD uses this to fill the F-key cap's border as the player
     * holds F toward the 1.5s confirm threshold.
     */
    holdProgress?: number;
}

/** Maximum weapons the player may pick up during the tavern weapon phase. */
export const TAVERN_WEAPON_MAX = 3;

/** Long-press duration (ms) needed to confirm character selection with F. */
const HOLD_MS = 1500;

// ─── TavernController ─────────────────────────────────────────────────────

export class TavernController {
    private phase: Phase = 'selection';
    private npcs: TavernNpcEntry[] = [];
    private selectedIndex = 0;

    private arrowOffsetY = 0;
    private arrowTime = 0;

    private keyLeft!: Phaser.Input.Keyboard.Key;
    private keyRight!: Phaser.Input.Keyboard.Key;
    /** F — held for HOLD_MS to confirm. */
    private keyConfirm!: Phaser.Input.Keyboard.Key;

    /** True while F is currently held down (used to detect release). */
    private fHolding = false;
    /** NPC index whose sprite is currently being held with the mouse.
     *  `undefined` when no mouse hold is active. Sharing the hold
     *  pipeline with the F key means the F cap border fills for
     *  either input. */
    private mouseHoldingIdx: number | undefined;
    /** Hold elapsed time, accumulated per frame from `delta`. Reset
     *  on every (re)press and on release. Drives `holdProgress` 0..1. */
    private holdElapsed = 0;

    /** Disposer for the window pointermove listener that feeds the
     *  pixel crosshair. Set in `bindCursor`, called from `destroy`. */
    private cursorCleanup: (() => void) | undefined;

    private weaponCount = 0;

    constructor(
        private readonly scene: Phaser.Scene,
        private readonly level: Level,
        private readonly assets: SceneAssets,
        /**
         * Called once when the player confirms a character.
         * The second argument is a callback the scene should pass into
         * DropController's onWeaponPickup — it returns true if the pickup
         * was accepted (count < cap), false if capped.
         */
        private readonly onConfirm: (
            selectedSpec: CharacterSpec,
            onWeaponPickup: (weaponId: string, weaponSpec: WeaponSpec) => boolean,
        ) => void,
    ) {
        // Pixel-crosshair + TavernHud inline `cursor: none` together
        // replace the default system arrow — see TavernHud's outer wrap
        // for the cursor rule. Phaser's input still flips to 'pointer'
        // over interactive sprites, but NPC sprites here use `setInteractive`
        // without `useHandCursor`, so the canvas cursor stays at
        // whatever Phaser's default is (empty in v4, so CSS rules win).
        this.bindCursor();

        this.setupKeys();
        this.spawnNpcs();
        this.buildSelectionVisuals();
        this.emitFocusEvent();

        scene.events.on('update', this.update, this);
        scene.events.once('shutdown', this.destroy, this);
        scene.events.once('destroy', this.destroy, this);
    }

    // ─── Keyboard ────────────────────────────────────────────────────────

    private setupKeys(): void {
        const kb = this.scene.input.keyboard!;
        this.keyLeft = kb.addKey(Phaser.Input.Keyboard.KeyCodes.A);
        this.keyRight = kb.addKey(Phaser.Input.Keyboard.KeyCodes.D);
        this.keyConfirm = kb.addKey(Phaser.Input.Keyboard.KeyCodes.F);
    }

    // ─── NPC sprites ─────────────────────────────────────────────────────

    private spawnNpcs(): void {
        const allChars = this.assets.allCharacters ?? [];
        const npcSpawns = this.level.npcSpawns ?? [];
        const imgW = this.level.imageSize.width;
        const imgH = this.level.imageSize.height;

        allChars.forEach((spec, i) => {
            if (!spec.sprite) return; // no sprite sheet — skip

            const spawn = npcSpawns[i];
            const x = spawn?.x ?? Math.round((imgW / (allChars.length + 1)) * (i + 1));
            const y = spawn?.y ?? Math.round(imgH * 0.6);

            const shadow = this.scene.add.ellipse(
                x, y,
                spec.body.halfW * 2.4,
                spec.body.halfH * 0.7,
                0x000000, 0.25,
            );

            // Same offset formula as CharacterController.updateSprite —
            // keeps the sprite's visible feet planted at `(x, y)` so the
            // shadow lines up.
            const offX = spec.sprite?.offset?.left ?? spec.sprite?.offset?.x ?? 0;
            const offY = spec.sprite?.offset?.bottom !== undefined
                ? -spec.sprite.offset.bottom
                : (spec.sprite?.offset?.y ?? 0);

            const key = textureKey(spec);
            const sprite = this.scene.add.sprite(x + offX, y + offY, key);
            sprite.setOrigin(0.5, 1.0);
            if (spec.sprite?.scale) sprite.setScale(spec.sprite.scale);

            // Default to the idle animation so the NPC looks alive — the
            // standard `<id>-idle` key was registered in scene.ts create().
            const idleKey = animKey(spec, 'idle');
            if (this.scene.anims.exists(idleKey)) sprite.play(idleKey, true);

            // Long-press to confirm (HOLD_MS). Single click selects
            // (or just resets the hold timer if already selected); the
            // hold timer runs in `update()` and the same `holdProgress`
            // drives both keyboard-F and mouse long-press, so the F
            // cap border fills for either input.
            //
            // No `useHandCursor` — the canvas already hides the system
            // cursor via CSS (`#game-container canvas { cursor: none }`),
            // and the pixel crosshair is the only on-screen pointer.
            // Letting Phaser set `cursor: pointer` here would stack a
            // second cursor on top of the crosshair over interactive
            // sprites.
            sprite.setInteractive();
            const idx = i;
            sprite.on('pointerdown', () => {
                if (this.selectedIndex !== idx) {
                    this.selectedIndex = idx;
                    this.updateHighlight();
                    this.emitFocusEvent();
                }
                this.mouseHoldingIdx = idx;
                this.holdElapsed = 0;
                this.fHolding = false;
            });
            const cancelHold = (): void => {
                if (this.mouseHoldingIdx === idx) {
                    this.mouseHoldingIdx = undefined;
                    this.holdElapsed = 0;
                }
            };
            sprite.on('pointerup', cancelHold);
            sprite.on('pointerout', cancelHold);

            this.npcs.push({ spec, sprite, shadow, x, y });
        });
    }

    // ─── Selection visuals ───────────────────────────────────────────────

    private buildSelectionVisuals(): void {
        // The selection arrow now lives in the React TavernHud so it
        // rides the same bobbing offset as the card. Reset the timer so
        // the animation starts at sin(0)=0 the moment the controller boots.
        this.arrowTime = 0;
        this.arrowOffsetY = 0;
    }

    private updateHighlight(): void {
        // No-op: the arrow is owned by React. Kept as a hook in case
        // future visuals (e.g. a highlight ring) need a callback on
        // selection change.
    }

    // ─── EventBus → React ────────────────────────────────────────────────

    private emitFocusEvent(holdProgress?: number): void {
        const entry = this.npcs[this.selectedIndex];
        if (!entry) {
            EventBus.emit('tavern-focus', null);
            return;
        }
        const s = entry.spec;
        // Phase 1 only: pass the arrow position in viewport coords so the
        // React HUD pins directly above it. Phase 2 falls back to the
        // default anchor (right side).
        let viewportX: number | undefined;
        let viewportY: number | undefined;
        if (this.phase === 'selection') {
            const head = this.worldToViewport(entry.x, this.headWorldY(entry));
            viewportX = head.x;
            viewportY = head.y;
        }
        const payload: TavernFocusPayload = {
            name: s.name,
            hp: s.hp,
            sp: s.sp,
            moveSpeed: s.moveSpeed,
            stats: (s as any).stats,
            phase: this.phase,
            weaponCount: this.weaponCount,
            weaponMax: TAVERN_WEAPON_MAX,
            viewportX,
            viewportY,
            arrowOffsetY: this.phase === 'selection' ? this.arrowOffsetY : undefined,
            holdProgress: this.phase === 'selection' ? holdProgress : undefined,
        };
        EventBus.emit('tavern-focus', payload);
    }

    /** World-space Y of the NPC's visual head. Same `topOffset` formula
     *  as status-hud + drawArrow, plus the sprite's own `offset.bottom`
     *  so the result tracks the sprite's actual visible top (not just the
     *  origin). */
    private headWorldY(entry: TavernNpcEntry): number {
        const spriteH = entry.sprite.displayHeight;
        const halfH = entry.spec.body.halfH;
        const topOffset = Math.max(halfH, spriteH - halfH);
        const offBottom = entry.spec.sprite?.offset?.bottom ?? 0;
        return entry.y - halfH - topOffset + offBottom;
    }

    /** World (x, y) → viewport pixels.
     *  - cam.scrollX/Y + cam.zoom: camera transform in world coords.
     *  - rect.width / canvas.width: CSS scale applied by `canvas-fit` to
     *    fit the canvas's internal (imageSize) pixels to the display rect.
     *    Phaser's `ScaleManager.setZoom()` only changes CSS, not the
     *    camera, so we must multiply by the CSS ratio explicitly.
     */
    private worldToViewport(worldX: number, worldY: number): { x: number; y: number } {
        const cam = this.scene.cameras.main;
        const canvas = this.scene.game.canvas as HTMLCanvasElement | null;
        const rect = canvas?.getBoundingClientRect();
        const offsetX = rect?.left ?? 0;
        const offsetY = rect?.top ?? 0;
        const ratioX = rect && canvas ? rect.width / canvas.width : 1;
        const ratioY = rect && canvas ? rect.height / canvas.height : 1;
        return {
            x: offsetX + (worldX - cam.scrollX) * cam.zoom * ratioX,
            y: offsetY + (worldY - cam.scrollY) * cam.zoom * ratioY,
        };
    }

    // ─── Confirm ─────────────────────────────────────────────────────────

    private confirmSelection(): void {
        if (this.phase !== 'selection') return;
        const entry = this.npcs[this.selectedIndex];
        if (!entry) return;

        const spec = entry.spec;
        useGameStore.getState().setSelectedCharacterId(spec.id);

        // Destroy NPC visuals (the selection arrow now lives in the React HUD)
        for (const npc of this.npcs) {
            npc.sprite.destroy();
            npc.shadow.destroy();
        }
        this.npcs = [];

        // Switch phase
        this.phase = 'pickup';
        this.weaponCount = 0;
        useGameStore.getState().setTavernWeaponCount(0);
        this.emitFocusEvent();

        // Hand control back to LoadScene
        this.onConfirm(spec, (_weaponId, _spec) => {
            if (this.weaponCount >= TAVERN_WEAPON_MAX) return false;
            this.weaponCount++;
            useGameStore.getState().setTavernWeaponCount(this.weaponCount);
            this.emitFocusEvent();
            return true;
        });
    }

    // ─── Per-frame ───────────────────────────────────────────────────────

    update(_time: number, delta: number): void {
        if (this.phase === 'selection') {
            // A / D navigation
            if (Phaser.Input.Keyboard.JustDown(this.keyLeft)) {
                this.selectedIndex = (this.selectedIndex - 1 + this.npcs.length) % this.npcs.length;
                this.updateHighlight();
                this.emitFocusEvent();
            }
            if (Phaser.Input.Keyboard.JustDown(this.keyRight)) {
                this.selectedIndex = (this.selectedIndex + 1) % this.npcs.length;
                this.updateHighlight();
                this.emitFocusEvent();
            }

            // Hold to confirm (1.5s). Either keyboard F or mouse hold on the
            // currently selected NPC drives the same `holdProgress`,
            // so the F cap border in the HUD fills for either input.
            // We accumulate per-frame `delta` (ms) rather than reading
            // Phaser's `time` so the bar fills at exactly HOLD_MS
            // regardless of any future time-scaling or pause.
            let holdProgress: number | undefined;
            const holding =
                this.keyConfirm.isDown || this.mouseHoldingIdx !== undefined;
            if (holding) {
                if (!this.fHolding) {
                    this.fHolding = true;
                    this.holdElapsed = 0;
                }
                this.holdElapsed += delta;
                holdProgress = Math.min(1, this.holdElapsed / HOLD_MS);
                if (holdProgress >= 1) {
                    this.fHolding = false;
                    this.mouseHoldingIdx = undefined;
                    this.holdElapsed = 0;
                    this.confirmSelection();
                    return;
                }
            } else if (this.fHolding) {
                // Released before reaching HOLD_MS — cancel.
                this.fHolding = false;
                this.holdElapsed = 0;
            }

            // Animate floating arrow (the arrow is rendered by the React HUD; we
            // just track the bobbing offset and push it through every frame)
            this.arrowTime += delta;
            this.arrowOffsetY = Math.sin(this.arrowTime / 350) * 6;

            // One combined emit per frame: position + arrow bob + hold
            // progress. Content fields stay identical between frames, so the
            // React side short-circuits setState and writes the new
            // `transform` / `clip-path` straight to the DOM.
            this.emitFocusEvent(holdProgress);
        }
    }

    // ─── Cleanup ─────────────────────────────────────────────────────────

    destroy(): void {
        this.scene.events.off('update', this.update, this);
        // Stop emitting aim events so the crosshair hides when the
        // tavern tears down (gameplay re-takes over via the character
        // aim logic, which also reads these events).
        this.unbindCursor();
        EventBus.emit('aim-crosshair-update', {
            x: -100,
            y: -100,
            isLocked: false,
            visible: false,
        });
        for (const npc of this.npcs) {
            try { npc.sprite.destroy(); } catch { /* ok */ }
            try { npc.shadow.destroy(); } catch { /* ok */ }
        }
        this.npcs = [];
        EventBus.emit('tavern-focus', null);
    }

    // ─── Cursor (pixel crosshair) ───────────────────────────────────────

    /** Window-level pointermove handler that feeds the pixel crosshair.
     *  PixelCrosshair expects coords in the 1536x864 native HUD space,
     *  same contract as character/logic.ts aim updates. */
    private bindCursor(): void {
        const canvas = this.scene.game.canvas as HTMLCanvasElement | null;
        if (!canvas) return;
        const camera = this.scene.cameras.main;

        const onMove = (e: PointerEvent): void => {
            const r = canvas.getBoundingClientRect();
            if (r.width <= 0 || r.height <= 0) return;
            if (
                e.clientX < r.left ||
                e.clientX > r.left + r.width ||
                e.clientY < r.top ||
                e.clientY > r.top + r.height
            ) {
                return;
            }
            // World coord = camera-relative pixel; then scale to the
            // 1536x864 HUD space PixelCrosshair expects.
            const worldX = camera.scrollX + (e.clientX - r.left) * (camera.width / r.width);
            const worldY = camera.scrollY + (e.clientY - r.top) * (camera.height / r.height);
            EventBus.emit('aim-crosshair-update', {
                x: (worldX - camera.scrollX) * (1536 / camera.width),
                y: (worldY - camera.scrollY) * (864 / camera.height),
                isLocked: false,
                visible: true,
            });
        };

        const onLeave = (): void => {
            EventBus.emit('aim-crosshair-update', {
                x: -100,
                y: -100,
                isLocked: false,
                visible: false,
            });
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerleave', onLeave);
        this.cursorCleanup = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerleave', onLeave);
        };
    }

    private unbindCursor(): void {
        this.cursorCleanup?.();
        this.cursorCleanup = undefined;
    }
}
