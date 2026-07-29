/**
 * src/game/characters/logic.ts
 * --------------------------------------------------------------------------
 * Player behavior. Two layers:
 *
 *   1. Pure helpers (moveIntent / dodgeIntent / clampToBounds) — no
 *      runtime dependencies, safe to import from Node tests.
 *
 *   2. CharacterController class — owns the per-frame tick, keyboard /
 *      pointer binding, and mutable state. Its constructor self-registers
 *      with `scene.events.on('update', ...)`. Uses `import type` for
 *      Phaser (types only) and hardcoded keycodes so this file has zero
 *      runtime Phaser dependency — keeps Node tests clean and the module
 *      trivially tree-shakeable.
 *
 * Phaser v4 compat: scene.events is a Phaser.Events.EventEmitter with
 * standard on/off (verified from phaser/types/phaser.d.ts).
 */

import type * as Phaser from 'phaser';

import {
    KEY_A,
    KEY_D,
    KEY_ONE,
    KEY_R,
    KEY_S,
    KEY_SHIFT,
    KEY_THREE,
    KEY_TWO,
    KEY_W,
} from '@/lib/constants';
import type { CharacterSpec } from '@/lib/characters';
import type { Level } from '@/lib/levels/types';

import { animKey } from './keys';

// ─── Pure helpers ────────────────────────────────────────────────────────

export interface MoveIntent {
    vx: number;
    vy: number;
}

/** Normalised WASD vector. Returns zero when no direction is pressed. */
export function moveIntent(keys: {
    up: boolean;
    down: boolean;
    left: boolean;
    right: boolean;
}): MoveIntent {
    let vx = 0;
    let vy = 0;
    if (keys.up) vy -= 1;
    if (keys.down) vy += 1;
    if (keys.left) vx -= 1;
    if (keys.right) vx += 1;
    const len = Math.hypot(vx, vy);
    if (len === 0) return { vx: 0, vy: 0 };
    return { vx: vx / len, vy: vy / len };
}

export interface DodgeIntent {
    vx: number;
    vy: number;
}

/**
 * Decide whether a dodge should trigger this frame and return its velocity.
 * Returns null when no dodge should fire.
 */
export function dodgeIntent(
    shiftDown: boolean,
    intent: MoveIntent,
    sp: number,
    spCost: number,
    cooldownMs: number,
    lastDodgeEndAt: number,
    dodgeActiveUntil: number,
    dodgeSpeed: number,
    now: number,
): DodgeIntent | null {
    const canDodge =
        sp >= spCost &&
        now - lastDodgeEndAt >= cooldownMs &&
        now >= dodgeActiveUntil;
    const hasDirection = intent.vx !== 0 || intent.vy !== 0;
    if (!shiftDown || !hasDirection || !canDodge) return null;
    return {
        vx: intent.vx * dodgeSpeed,
        vy: intent.vy * dodgeSpeed,
    };
}

/** Clamp `pos` to the world rectangle. Returns null when already inside. */
export function clampToBounds(
    pos: { x: number; y: number },
    halfW: number,
    halfH: number,
    worldW: number,
    worldH: number,
): { x: number; y: number } | null {
    const maxX = worldW - halfW;
    const maxY = worldH - halfH;
    if (pos.x >= halfW && pos.x <= maxX && pos.y >= halfH && pos.y <= maxY) {
        return null;
    }
    return {
        x: Math.max(halfW, Math.min(maxX, pos.x)),
        y: Math.max(halfH, Math.min(maxY, pos.y)),
    };
}

// ─── Controller ──────────────────────────────────────────────────────────

// Body size + dodge params come from CharacterSpec (loaded from YAML).
// Keycodes come from `@/lib/constants` — Phaser's runtime reads browser
// globals at module load and crashes in Node tests, so the player keymap
// lives as plain numbers in shared constants rather than importing
// `Input.Keyboard.KeyCodes`.

/** Structural shape the controller needs from the WeaponSystem. */
export interface WeaponsLike {
    update(time: number, tx: number, ty: number, fire: boolean, halfH: number): void;
    switchTo(index: number): void;
    manualReload(): void;
    refillActiveAmmo(fraction: number): void;
    swapToWeapon(weaponId: string): boolean;
    getActiveSlotState(): StatusHudState;
}

/** Structural shape the controller needs from the character HUD. */
export interface HudLike {
    update(spec: CharacterSpec, hp: number, sp: number): void;
}

/** Structural shape the controller needs from the weapon HUD. */
export interface WeaponHudLike {
    draw(weapons: WeaponsLike, time: number): void;
}

/** Structural shape the controller needs from the floating status HUD
 *  (above the character's head — currently shows reload progress). */
export interface StatusHudLike {
    update(state: StatusHudState, time: number, halfH: number): void;
}

/** Subset of weapon-slot state StatusHud needs. */
export interface StatusHudState {
    reloading: boolean;
    reloadStartedAt: number;
    reloadTimeMs: number;
    justCompletedAt: number;
}

/** Everything the controller needs from outside — passed in by load-character. */
export interface CharacterRuntimeParts {
    /** Matter body — typed as `any` to avoid pulling in matter-js types. */
    body: any;
    sprite: Phaser.GameObjects.Sprite;
    /** Matter library reference (for Body.setVelocity / setPosition). */
    matter: any;
    weapons: WeaponsLike;
    hud: HudLike;
    weaponHud: WeaponHudLike;
    statusHud: StatusHudLike;
}

export class CharacterController {
    private readonly scene: Phaser.Scene;
    private readonly spec: CharacterSpec;
    private readonly level: Level;
    private readonly parts: CharacterRuntimeParts;

    // Mutable runtime state.
    private hp: number;
    private sp: number;
    private dodgeActiveUntil = 0;
    private lastDodgeEndAt = 0;
    private dodgeVx = 0;
    private dodgeVy = 0;
    private firing = false;
    private targetX = 0;
    private targetY = 0;

    private readonly cleanupFns: Array<() => void> = [];

    constructor(
        scene: Phaser.Scene,
        level: Level,
        spec: CharacterSpec,
        parts: CharacterRuntimeParts,
    ) {
        this.scene = scene;
        this.level = level;
        this.spec = spec;
        this.parts = parts;
        this.hp = spec.hp;
        this.sp = spec.sp;
        this.targetX = level.imageSize.width / 2;
        this.targetY = level.imageSize.height / 2;

        this.bindKeyboard();
        this.bindPointer();

        // Chain the dodge -> idle transition. Bound once in the
        // constructor so we don't leak listeners on every stop event.
        const onAnimDone = () => this.onAnimComplete();
        this.parts.sprite.on('animationcomplete', onAnimDone);
        this.cleanupFns.push(() => this.parts.sprite.off('animationcomplete', onAnimDone));

        const tick = () => this.update(scene.time.now);
        scene.events.on('update', tick);
        this.cleanupFns.push(() => scene.events.off('update', tick));
    }

    // ─── Public API ──────────────────────────────────────────────────────

    /** Apply HP/SP healing (clamped to [0, max]). Negative values damage. */
    heal(hpDelta: number, spDelta: number): void {
        if (hpDelta !== 0) this.hp = Math.max(0, Math.min(this.spec.hp, this.hp + hpDelta));
        if (spDelta !== 0) this.sp = Math.max(0, Math.min(this.spec.sp, this.sp + spDelta));
    }

    /** Add `fraction * currentWeaponClipSize` bullets to the active weapon. */
    refillAmmo(fraction: number): void {
        this.parts.weapons.refillActiveAmmo(fraction);
    }

    /** Switch to a named weapon if it's in the hotbar. No-op if not present. */
    pickUpWeapon(weaponId: string): boolean {
        return this.parts.weapons.swapToWeapon(weaponId);
    }

    /** Tear down all bindings and visual resources. */
    destroy(): void {
        for (const fn of this.cleanupFns) fn();
        this.cleanupFns.length = 0;
        this.parts.sprite.destroy();
        this.scene.matter.world.remove(this.parts.body);
    }

    /** Drive one tick manually — useful for tests; normally scene events do it. */
    update(now: number): void {
        const kb = this.scene.input.keyboard!;
        const intent = moveIntent({
            up: kb.addKey(KEY_W).isDown,
            down: kb.addKey(KEY_S).isDown,
            left: kb.addKey(KEY_A).isDown,
            right: kb.addKey(KEY_D).isDown,
        });

        // ── Dodge initiation ────────────────────────────────────────
        const shiftDown = kb.addKey(KEY_SHIFT).isDown;
        const dodge = dodgeIntent(
            shiftDown,
            intent,
            this.sp,
            this.spec.dodge.spCost,
            this.spec.dodge.cooldownMs,
            this.lastDodgeEndAt,
            this.dodgeActiveUntil,
            this.spec.dodge.speed,
            now,
        );
        if (dodge) {
            this.sp -= this.spec.dodge.spCost;
            this.dodgeVx = dodge.vx;
            this.dodgeVy = dodge.vy;
            this.dodgeActiveUntil = now + this.spec.dodge.durationMs;
            this.lastDodgeEndAt = now + this.spec.dodge.durationMs;
        }

        // ── Velocity resolution ─────────────────────────────────────
        let finalVx = 0;
        let finalVy = 0;
        if (now < this.dodgeActiveUntil) {
            finalVx = this.dodgeVx;
            finalVy = this.dodgeVy;
        } else if (intent.vx !== 0 || intent.vy !== 0) {
            finalVx = intent.vx * this.spec.moveSpeed;
            finalVy = intent.vy * this.spec.moveSpeed;
        }
        this.parts.matter.Body.setVelocity(this.parts.body, { x: finalVx, y: finalVy });

        // ── World-bounds clamp ──────────────────────────────────────
        const clamped = clampToBounds(
            this.parts.body.position,
            this.spec.body.halfW,
            this.spec.body.halfH,
            this.level.imageSize.width,
            this.level.imageSize.height,
        );
        if (clamped) {
            this.parts.matter.Body.setPosition(this.parts.body, clamped);
            this.parts.matter.Body.setVelocity(this.parts.body, { x: 0, y: 0 });
        }

        // ── Visual sync ─────────────────────────────────────────────
        const sprite = this.parts.sprite;
        const pos = this.parts.body.position;
        // Body center is halfH above the feet anchor; sprite origin is
        // (0.5, 1.0), so we shift down by halfH to keep feet aligned
        // with the body's bottom edge as it moves.
        sprite.setPosition(pos.x, pos.y + this.spec.body.halfH);
        // Sprite faces the cursor (mouse-aimed top-down shooter). The
        // controller already maintains `targetX` / `targetY` from pointer
        // events, so the weapon aim and the sprite facing stay aligned.
        sprite.setFlipX(this.targetX < pos.x);

        // ── Animation state machine ─────────────────────────────────
        this.driveAnims(intent.vx !== 0 || intent.vy !== 0, now < this.dodgeActiveUntil);

        // ── SP regen ────────────────────────────────────────────────
        if (now >= this.dodgeActiveUntil && this.sp < this.spec.sp) {
            this.sp = Math.min(
                this.spec.sp,
                this.sp + (this.spec.sp * 16) / this.spec.spRegenMs,
            );
        }

        // ── Weapon update ───────────────────────────────────────────
        this.parts.weapons.update(
            now,
            this.targetX,
            this.targetY,
            this.firing && now >= this.dodgeActiveUntil,
            this.spec.body.halfH,
        );

        // ── HUD ─────────────────────────────────────────────────────
        this.parts.hud.update(this.spec, this.hp, this.sp);
        this.parts.weaponHud.draw(this.parts.weapons, now);
        this.parts.statusHud.update(
            this.parts.weapons.getActiveSlotState(),
            now,
            this.spec.body.halfH,
        );
    }

    // ─── Internals ──────────────────────────────────────────────────────

    /**
     * State machine: idle ↔ run ↔ dodge.
     *   - `dodge` plays for the entire dodge window (covers the full
     *     roll animation, even past the 220ms physics window).
     *   - `run` while moving and not in a dodge roll.
     *   - `idle` otherwise.
     *   - When the dodge roll's animationcomplete fires, onAnimComplete
     *     chains to run or idle based on current movement.
     *
     * Each anim is gated on `scene.anims.exists(key)` so a character
     * without declared anims falls through silently (debug fallback).
     */
    private driveAnims(isMovingInput: boolean, isDodging: boolean): void {
        if (!this.spec.anims) return;
        const sprite = this.parts.sprite;
        const runKey = animKey(this.spec, 'run');
        const dodgeKey = animKey(this.spec, 'dodge');
        const idleKey = animKey(this.spec, 'idle');
        const cur = sprite.anims.currentAnim?.key ?? null;

        if (isDodging && this.scene.anims.exists(dodgeKey)) {
            // Active dodge window — start the roll if not already running.
            if (cur !== dodgeKey) sprite.anims.play(dodgeKey, true);
            return;
        }
        if (cur === dodgeKey) {
            // Dodge window ended but the roll animation is still in
            // flight — let it play through. onAnimComplete chains to
            // run or idle based on movement state.
            return;
        }
        const moving = isMovingInput;
        if (moving) {
            if (cur !== runKey && this.scene.anims.exists(runKey)) {
                sprite.anims.play(runKey, true);
            }
        } else if (cur !== idleKey && this.scene.anims.exists(idleKey)) {
            sprite.anims.play(idleKey, true);
        }
    }

    /**
     * Hooked on `sprite.on('animationcomplete', ...)` in the constructor.
     * When the dodge roll finishes, chain to run (if still moving) or
     * idle (otherwise). Other animation ends are no-ops so this stays
     * safe to bind once and forget.
     */
    private onAnimComplete(): void {
        if (!this.spec.anims) return;
        const sprite = this.parts.sprite;
        const cur = sprite.anims.currentAnim?.key;
        const dodgeKey = animKey(this.spec, 'dodge');
        if (cur !== dodgeKey) return;
        // Dodge roll finished — sample current movement to pick the
        // right follow-up. Sampling at completion time (not at the
        // original dodge trigger) means releasing WASD during the roll
        // correctly transitions to idle.
        const kb = this.scene.input.keyboard!;
        const intent = moveIntent({
            up: kb.addKey(KEY_W).isDown,
            down: kb.addKey(KEY_S).isDown,
            left: kb.addKey(KEY_A).isDown,
            right: kb.addKey(KEY_D).isDown,
        });
        if (intent.vx !== 0 || intent.vy !== 0) {
            const runKey = animKey(this.spec, 'run');
            if (this.scene.anims.exists(runKey)) sprite.anims.play(runKey, true);
        } else {
            const idleKey = animKey(this.spec, 'idle');
            if (this.scene.anims.exists(idleKey)) sprite.anims.play(idleKey, true);
        }
    }

    private bindKeyboard(): void {
        const kb = this.scene.input.keyboard!;
        const weapons = this.parts.weapons;
        kb.addKey(KEY_W);
        kb.addKey(KEY_A);
        kb.addKey(KEY_S);
        kb.addKey(KEY_D);
        kb.addKey(KEY_SHIFT);

        kb.addKey(KEY_ONE).on('down', () => weapons.switchTo(0));
        kb.addKey(KEY_TWO).on('down', () => weapons.switchTo(1));
        kb.addKey(KEY_THREE).on('down', () => weapons.switchTo(2));
        kb.addKey(KEY_R).on('down', () => weapons.manualReload());
    }

    private bindPointer(): void {
        const canvas = (this.scene as any).game?.canvas as HTMLCanvasElement | undefined;
        if (!canvas) return;
        const updateTarget = (e: PointerEvent) => {
            const rectEl = canvas.getBoundingClientRect();
            const camera = this.scene.cameras.main;
            this.targetX =
                camera.scrollX + (e.clientX - rectEl.left) * (camera.width / rectEl.width);
            this.targetY =
                camera.scrollY + (e.clientY - rectEl.top) * (camera.height / rectEl.height);
        };
        const onDown = (e: PointerEvent) => {
            updateTarget(e);
            this.firing = true;
        };
        const onMove = (e: PointerEvent) => {
            // Always track the cursor, not just while firing — the sprite
            // should face the mouse at all times so weapon aim and
            // visual facing stay aligned.
            updateTarget(e);
        };
        const stop = () => {
            this.firing = false;
        };
        canvas.addEventListener('pointerdown', onDown);
        canvas.addEventListener('pointermove', onMove);
        canvas.addEventListener('pointerup', stop);
        canvas.addEventListener('pointerleave', stop);
        this.cleanupFns.push(() => {
            canvas.removeEventListener('pointerdown', onDown);
            canvas.removeEventListener('pointermove', onMove);
            canvas.removeEventListener('pointerup', stop);
            canvas.removeEventListener('pointerleave', stop);
        });
    }
}