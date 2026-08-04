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
import type { CharacterRuntime } from '@/game/characters/character';
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
     * F / mouse hold active right now. The HUD applies a `.f-holding`
     * CSS class for the duration of the hold; a CSS @keyframes runs
     * the border fill over 1.5s on the GPU. When the controller's
     * internal timer reaches HOLD_MS it fires `confirmSelection` and
     * stops emitting `holding: true`.
     */
    holding?: boolean;
}

/** Maximum weapons the player may pick up during the tavern weapon phase.
 *  The actual cap is per-character (`CharacterSpec.weaponMax`); this
 *  constant is kept for HUD layout / external callers that still ask
 *  for a fallback maximum. */
export const TAVERN_WEAPON_MAX = 3;

/** Long-press duration (ms) needed to confirm character selection with F. */
const HOLD_MS = 1500;

// ─── TavernController ─────────────────────────────────────────────────────

export class TavernController {
    private phase: Phase = 'selection';
    private npcs: TavernNpcEntry[] = [];
    private selectedIndex = 0;

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
        /** The default character LoadScene spawned — hidden behind the
         *  selection UI, parked off-screen, swapped on confirm. */
        private readonly defaultCharacter: CharacterRuntime,
        /**
         * Called once when the player confirms a character. The scene
         * destroys the default character, loads the picked spec, and
         * re-points monsterSystem at the new body. TavernController
         * self-destroys after this fires. Ignored when `startPhase`
         * is `'pickup'` — the selection UI doesn't run in that mode.
         */
        private readonly onConfirm: (selectedSpec: CharacterSpec) => void,
        /**
         * Initial phase. `'selection'` (default) spawns NPC sprites
         * for the F-hold selection UI; `'pickup'` skips NPC spawn
         * and only wires the weapon-pickup / replace-hub callbacks.
         * The refresh-into-tavern path passes `'pickup'` so the
         * replace-hub still works after the player already chose a
         * character.
         */
        startPhase: Phase = 'selection',
    ) {
        this.phase = startPhase;
        // Pixel-crosshair + TavernHud inline `cursor: none` together
        // replace the default system arrow — see TavernHud's outer wrap
        // for the cursor rule. Phaser's input still flips to 'pointer'
        // over interactive sprites, but NPC sprites here use `setInteractive`
        // without `useHandCursor`, so the canvas cursor stays at
        // whatever Phaser's default is (empty in v4, so CSS rules win).
        this.bindCursor();


        if (startPhase === 'selection') {
            // NPC selection UI: spawn idle sprites, bind A/D/F, emit
            // focus events so the React TavernHud renders the
            // character-info panel.
            this.setupKeys();
            this.spawnNpcs();
            this.buildSelectionVisuals();
            this.emitFocusEvent();
        }
        // `startPhase === 'pickup'` skips NPC spawn — used when the
        // player refreshes into the tavern after already choosing a
        // character. The scene still wires weapon pickups through
        // `notifyWeaponAdded` / `requestWeaponReplace` /
        // `confirmWeaponReplace`, which are all phase-agnostic.

        scene.events.on('update', this.update, this);
        scene.events.once('shutdown', this.destroy, this);
        scene.events.once('destroy', this.destroy, this);
    }

    // ─── Keyboard ────────────────────────────────────────────────────────


    /**
     * Cap check for the tavern phase-2 weapon pickup. Called by
     * LoadScene's DropController onWeaponPickup callback. The scene
     * has already added the weapon to the hotbar via the character's
     * `tryPickupWeaponById`; this method just bumps the displayed
     * counter and re-emits focus so the HUD updates its `weaponCount`.
     */
    public notifyWeaponAdded(): void {
        this.weaponCount++;
        useGameStore.getState().setTavernWeaponCount(this.weaponCount);
        this.emitFocusEvent();
    }

    /**
     * True when the weapon at `slotIndex` is part of the chosen
     * character's starting `hotbar` — those are 专武 / dedicated
     * weapons and must not be auto-replaced when the player walks
     * onto a new drop at cap. Used by scene.ts to decide whether
     * the auto-swap flow should drop the old weapon or skip.
     */
    public isSlotLocked(slotIndex: number, character: CharacterRuntime): boolean {
        const slot = character.weapons?.getSlot(slotIndex);
        if (!slot) return false;
        return this.isLockedSlot(slot.spec.id ?? '');
    }

    /** True when `weaponId` was in the chosen character's starting
     *  hotbar — those slots are locked from replacement by design. */
    private isLockedSlot(weaponId: string): boolean {
        // The post-confirm character is the chosen spec; we look it up
        // by id from `assets.allCharacters` (tavern-only) or fall back
        // to `assets.character` (single-character mode).
        const all = this.assets.allCharacters ?? [];
        const picked = all.find((c) => c.id === this.sceneCharacterId()) ?? this.assets.character;
        return picked.hotbar.includes(weaponId);
    }

    /** Read the chosen character's id from the store. Falls back to
     *  the default-character id when no selection has been recorded. */
    private sceneCharacterId(): string {
        return useGameStore.getState().selectedCharacterId ?? this.assets.character.id;
    }

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
        // The selection arrow lives in the React TavernHud, bobs via
        // CSS (`tavern-hud-bob`). Nothing to wire up here — kept as a
        // hook for future selection visuals (e.g. a highlight ring).
    }

    private updateHighlight(): void {
        // No-op: the arrow is owned by React. Kept as a hook in case
        // future visuals (e.g. a highlight ring) need a callback on
        // selection change.
    }

    // ─── EventBus → React ────────────────────────────────────────────────

    private emitFocusEvent(holding: boolean = false): void {
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
            holding: this.phase === 'selection' ? holding : undefined,
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

        // Hand control back to LoadScene — it swaps the character to
        // the picked spec. The phase 2 weapon cap is tracked here and
        // gated through tryAcceptWeapon() called by LoadScene's drop
        // onWeaponPickup callback.
        this.onConfirm(spec);
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
            // currently selected NPC drives the same `holdElapsed`, so
            // the F cap border in the HUD fills for either input. We
            // accumulate per-frame `delta` (ms) rather than reading
            // Phaser's `time` so the threshold is reached at exactly
            // HOLD_MS regardless of any future time-scaling or pause.
            //
            // The HUD's actual fill animation is a CSS @keyframes
            // (`tavern-f-fill`) toggled by `holding` — we don't push
            // per-frame progress here; CSS runs the smooth 1.5s fill
            // on the GPU compositor and resets on F release.
            const holding =
                this.keyConfirm.isDown || this.mouseHoldingIdx !== undefined;
            if (holding) {
                if (!this.fHolding) {
                    this.fHolding = true;
                    this.holdElapsed = 0;
                }
                this.holdElapsed += delta;
                if (this.holdElapsed >= HOLD_MS) {
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

            // One combined emit per frame: position (unchanged for this NPC) +
            // `holding` boolean (CSS drives the fill, not us). Content
            // fields stay identical between frames, so the React side
            // short-circuits setState and writes straight to the DOM
            // for the high-frequency path. Arrow bobbing is handled by
            // CSS keyframes (`tavern-hud-bob` in TavernHud).
            this.emitFocusEvent(holding);
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
