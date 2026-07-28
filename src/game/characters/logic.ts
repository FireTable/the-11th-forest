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

import type { CharacterSpec } from '@/lib/characters';
import type { Level } from '@/lib/levels/types';

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

const HALF_W = 16;
const HALF_H = 24;
/** Px / physics step — kept below the thinnest wall triangle so the body
 *  can't tunnel past a wall edge in one Matter step. */
const DODGE_SPEED = 14;
const DODGE_DURATION_MS = 220;
const DODGE_COOLDOWN_MS = 600;

// Hardcoded keycodes (replaces Phaser.Input.Keyboard.KeyCodes.X). Keeping
// logic.ts runtime-Phaser-free: this file uses `import type` only.
const KEY_W = 87;
const KEY_A = 65;
const KEY_S = 83;
const KEY_D = 68;
const KEY_SHIFT = 16;
const KEY_ONE = 49;
const KEY_TWO = 50;
const KEY_THREE = 51;
const KEY_R = 82;

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
    rect: Phaser.GameObjects.Rectangle;
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
        this.parts.rect.destroy();
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
            this.spec.dodgeSpCost,
            DODGE_COOLDOWN_MS,
            this.lastDodgeEndAt,
            this.dodgeActiveUntil,
            DODGE_SPEED,
            now,
        );
        if (dodge) {
            this.sp -= this.spec.dodgeSpCost;
            this.dodgeVx = dodge.vx;
            this.dodgeVy = dodge.vy;
            this.dodgeActiveUntil = now + DODGE_DURATION_MS;
            this.lastDodgeEndAt = now + DODGE_DURATION_MS;
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
            HALF_W,
            HALF_H,
            this.level.imageSize.width,
            this.level.imageSize.height,
        );
        if (clamped) {
            this.parts.matter.Body.setPosition(this.parts.body, clamped);
            this.parts.matter.Body.setVelocity(this.parts.body, { x: 0, y: 0 });
        }

        // ── Visual sync ─────────────────────────────────────────────
        const pos = this.parts.body.position;
        this.parts.rect.setPosition(pos.x, pos.y);
        if (Math.abs(finalVx) + Math.abs(finalVy) > 0.1) {
            this.parts.rect.setRotation(Math.atan2(finalVy, finalVx));
        }

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
            HALF_H,
        );

        // ── HUD ─────────────────────────────────────────────────────
        this.parts.hud.update(this.spec, this.hp, this.sp);
        this.parts.weaponHud.draw(this.parts.weapons, now);
        this.parts.statusHud.update(this.parts.weapons.getActiveSlotState(), now, HALF_H);
    }

    // ─── Internals ──────────────────────────────────────────────────────

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
            if (this.firing) updateTarget(e);
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