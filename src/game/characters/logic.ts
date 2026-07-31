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
    KEY_FIVE,
    KEY_FOUR,
    KEY_ONE,
    KEY_R,
    KEY_S,
    KEY_SEVEN,
    KEY_SHIFT,
    KEY_SIX,
    KEY_THREE,
    KEY_TWO,
    KEY_W,
    SFX_EVENT,
    AIM_ASSIST,
} from '@/lib/constants';
import { getCheats } from '@/lib/dev/cheats';
import { EventBus } from '@/lib/events/bus';
import type { CharacterSpec } from '@/lib/characters';
import type { Level } from '@/lib/levels/types';

import { animKey } from './keys';

/** Dev cheat HP cap — effectively "cannot die". */
const INFINITE_HP_VALUE = 999_999_999;

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

/**
 * Pick the SFX id for a "player got hit" event. Pure helper so tests
 * can verify the gender routing without booting a Phaser scene.
 *
 * Lookup order:
 *   1. gender === 'female'  →  sfx.hurtFemale
 *   2. gender === 'male'    →  sfx.hurtMale
 *   3. fallback             →  sfx.hurt (legacy / gender-neutral)
 *
 * Returns null when nothing is configured (caller skips the SFX emit).
 */
export function resolveHurtSfx(spec: {
    gender?: 'male' | 'female';
    sfx?: {
        hurt?: string;
        hurtMale?: string;
        hurtFemale?: string;
    };
}): string | null {
    const sfx = spec.sfx;
    if (!sfx) return null;
    if (spec.gender === 'female') return sfx.hurtFemale ?? sfx.hurt ?? null;
    if (spec.gender === 'male') return sfx.hurtMale ?? sfx.hurt ?? null;
    return sfx.hurt ?? null;
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
    showFloatingNumber?(amount: number, type: 'damage' | 'heal'): void;
}

/** Subset of weapon-slot state StatusHud needs. */
export interface StatusHudState {
    name?: string;
    reloading?: boolean;
    reloadStartedAt?: number;
    reloadTimeMs?: number;
    justCompletedAt?: number;
    hp?: number;
    maxHp?: number;
    showHpBar?: boolean;
    sp?: number;
    maxSp?: number;
    showSpBar?: boolean;
    dodgeActive?: boolean;
    dodgeCooldownStartedAt?: number;
    dodgeCooldownTimeMs?: number;
}

/** Everything the controller needs from outside — passed in by load-character. */
export interface CharacterRuntimeParts {
    body: any;
    sprite: Phaser.GameObjects.Sprite;
    shadow?: Phaser.GameObjects.Shape;
    debugBodyRect?: Phaser.GameObjects.Rectangle;
    debugHitboxRect?: Phaser.GameObjects.Rectangle;
    matter: any;
    weapons: WeaponsLike;
    hud: HudLike;
    weaponHud: WeaponHudLike;
    statusHud: StatusHudLike;
}

export class CharacterController {
    private readonly scene: Phaser.Scene;
    private readonly spec: CharacterSpec;
    private readonly parts: CharacterRuntimeParts;

    // Mutable runtime state.
    private hp: number;
    private sp: number;
    private dodgeActiveUntil = 0;
    private lastDodgeEndAt = 0;
    private dodgeVx = 0;
    private dodgeVy = 0;
    private firing = false;
    // null until the first pointermove — lets the spawn-time flipX hold
    // instead of immediately snapping to wherever the cursor happens to be.
    private targetX: number | null = null;
    private targetY: number | null = null;
    /** Last footstep SFX time — throttle to ~5 per second so the loop
     *  doesn't spam when the player holds WASD. */
    private lastFootstepAt = 0;
    /** Throttle for the low-HP heartbeat so it pulses rather than buzzes. */
    private lastHeartbeatAt = 0;
    /** Dev cheat: when true, `heal(hpDelta<0, …)` is a no-op so the
     *  character can't die. Toggled via the cheat panel / EventBus. */
    private infiniteHp = false;

    private readonly cleanupFns: Array<() => void> = [];

    constructor(
        scene: Phaser.Scene,
        _level: Level,
        spec: CharacterSpec,
        parts: CharacterRuntimeParts,
    ) {
        this.scene = scene;
        this.spec = spec;
        this.parts = parts;
        this.hp = spec.hp;
        this.sp = spec.sp;

        // Honor a pre-existing dev "Infinite HP" toggle (e.g. user
        // toggled it, then refreshed the page). The cheat panel only
        // mounts on localhost — same gate as `isDev()` — so this is
        // inert in production.
        if (getCheats().infiniteHp) {
            this.infiniteHp = true;
            this.hp = INFINITE_HP_VALUE;
        }

        // Spawn-time target stays null — the first real pointermove will
        // populate it. Until then, the sprite keeps the flipX that
        // loadCharacter() set from level.characterSpawn.facing.

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

        // Dev cheat — Infinite HP toggle. Updates the runtime flag and
        // bumps HP to the cap when enabling.
        const infiniteHpHandler = (payload?: { value?: boolean }) => {
            this.infiniteHp = payload?.value === true;
            if (this.infiniteHp) this.hp = INFINITE_HP_VALUE;
        };
        EventBus.on('dev:cheat:infiniteHp', infiniteHpHandler);
        this.cleanupFns.push(() => EventBus.removeListener('dev:cheat:infiniteHp', infiniteHpHandler));
    }

    // ─── Public API ──────────────────────────────────────────────────────

    /** Apply HP/SP healing (clamped to [0, max]). Negative values damage.
     *  Dev cheat: when `infiniteHp` is on, negative HP deltas are
     *  silently ignored so the player can't die. */
    heal(hpDelta: number, spDelta: number): void {
        const hpBlocked = this.infiniteHp && hpDelta < 0;
        if (hpDelta !== 0 && !hpBlocked) {
            const oldHp = this.hp;
            this.hp = Math.max(0, Math.min(this.spec.hp, this.hp + hpDelta));
            const actualDelta = this.hp - oldHp;
            if (actualDelta !== 0 && this.parts.statusHud?.showFloatingNumber) {
                this.parts.statusHud.showFloatingNumber(actualDelta, actualDelta > 0 ? 'heal' : 'damage');
            }
            if (hpDelta < 0) {
                const sfx = resolveHurtSfx(this.spec);
                if (sfx) {
                    EventBus.emit(SFX_EVENT(sfx), {
                        key: `character:${this.spec.id}`,
                        throttleMs: this.spec.sfx?.throttleMs,
                    });
                }
            }
        }
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
            const sfx = this.spec.sfx?.dodge;
            if (sfx) EventBus.emit(SFX_EVENT(sfx));
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

        // ── Visual sync ─────────────────────────────────────────────
        const sprite = this.parts.sprite;
        const pos = this.parts.body.position;
        // Calculate visual offset. `left` shifts right (+) / left (-), `bottom` shifts up (-) / down (+)
        const rawX = this.spec.sprite?.offset?.left ?? this.spec.sprite?.offset?.x ?? 0;
        const rawY = this.spec.sprite?.offset?.bottom !== undefined 
            ? -this.spec.sprite.offset.bottom 
            : (this.spec.sprite?.offset?.y ?? 0);
        const offX = rawX * (sprite.flipX ? -1 : 1);
        const offY = rawY;
        sprite.setPosition(pos.x + offX, pos.y + this.spec.body.halfH + offY);
        // Dynamic Y-Sorting depth for character
        const feetY = Math.round(pos.y + this.spec.body.halfH);
        sprite.setDepth(feetY);
        if (this.parts.shadow) {
            this.parts.shadow.setPosition(pos.x, pos.y + this.spec.body.halfH);
            this.parts.shadow.setDepth(feetY - 1);
        }
        if (this.parts.debugBodyRect) {
            this.parts.debugBodyRect.setPosition(pos.x, pos.y);
            this.parts.debugBodyRect.setDepth(feetY + 1);
        }
        if (this.parts.debugHitboxRect) {
            this.parts.debugHitboxRect.setPosition(pos.x, pos.y + this.spec.body.halfH - sprite.displayHeight / 2);
            this.parts.debugHitboxRect.setDepth(feetY + 2);
        }
        // Sprite faces the cursor (mouse-aimed top-down shooter). The
        // controller already maintains `targetX` / `targetY` from pointer
        // events, so the weapon aim and the sprite facing stay aligned.
        // Until the first real pointermove arrives we leave the flipX that
        // loadCharacter() set from level.characterSpawn.facing — comparing
        // `null < pos.x` would always be true and flip the sprite on the
        // very first tick, undoing the spawn-time facing.
        if (this.targetX !== null) sprite.setFlipX(this.targetX < pos.x);

        // Per-frame magnetic aim assist update (for moving monsters / camera)
        this.updateAimTarget(now);

        // ── Animation state machine ─────────────────────────────────
        this.driveAnims(intent.vx !== 0 || intent.vy !== 0, now < this.dodgeActiveUntil);

        // ── SP regen ────────────────────────────────────────────────
        if (now >= this.dodgeActiveUntil && this.sp < this.spec.sp) {
            this.sp = Math.min(
                this.spec.sp,
                this.sp + (this.spec.sp * 16) / this.spec.spRegenMs,
            );
        }

        // ── Footstep SFX (throttled; cadence from spec) ─────────────
        const moving = intent.vx !== 0 || intent.vy !== 0;
        const footstepThrottleMs = this.spec.sfx?.footstepThrottleMs ?? 200;
        if (
            moving &&
            now >= this.dodgeActiveUntil &&
            now - this.lastFootstepAt > footstepThrottleMs
        ) {
            const sfx = this.spec.sfx?.footstep;
            if (sfx) EventBus.emit(SFX_EVENT(sfx));
            this.lastFootstepAt = now;
        }

        // ── Low-HP heartbeat (threshold + pulse from spec) ──────────
        const lowHpThreshold = this.spec.sfx?.lowHpThreshold ?? 0.3;
        const lowHpPulseMs = this.spec.sfx?.lowHpPulseMs ?? 900;
        if (this.hp < this.spec.hp * lowHpThreshold && now - this.lastHeartbeatAt > lowHpPulseMs) {
            const sfx = this.spec.sfx?.lowHpHeartbeat;
            if (sfx) EventBus.emit(SFX_EVENT(sfx));
            this.lastHeartbeatAt = now;
        }

        // ── Weapon update ───────────────────────────────────────────
        // Default aiming target when cursor hasn't moved yet aligns with character's sprite facing (flipX)
        const defaultAimX = pos.x + (sprite.flipX ? -100 : 100);
        const defaultAimY = pos.y - this.spec.body.halfH;

        this.parts.weapons.update(
            now,
            this.targetX ?? defaultAimX,
            this.targetY ?? defaultAimY,
            this.firing && now >= this.dodgeActiveUntil,
            this.spec.body.halfH,
        );

        // ── HUD ─────────────────────────────────────────────────────
        this.parts.hud.update(this.spec, this.hp, this.sp);
        this.parts.weaponHud.draw(this.parts.weapons, this.scene.time.now);
        // Character body position center is at (feetY - halfH).
        // Distance from body.position to sprite top is: displayHeight - halfH
        const topOffset = Math.max(this.spec.body.halfH, this.parts.sprite.displayHeight - this.spec.body.halfH);
        const slotState = this.parts.weapons.getActiveSlotState();
        this.parts.statusHud.update(
            {
                name: this.spec.name,
                ...slotState,
                hp: this.hp,
                maxHp: this.spec.hp,
                showHpBar: true,
                sp: this.sp,
                maxSp: this.spec.sp,
                showSpBar: true,
                dodgeActive: now < this.dodgeActiveUntil,
                dodgeCooldownStartedAt: this.lastDodgeEndAt,
                dodgeCooldownTimeMs: this.spec.dodge.cooldownMs,
            },
            now,
            topOffset,
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
     *     chains to walk or idle based on current movement.
     *
     * Each anim is gated on `scene.anims.exists(key)` so a character
     * without declared anims falls through silently (debug fallback).
     */
    private driveAnims(isMovingInput: boolean, isDodging: boolean): void {
        if (!this.spec.anims) return;
        const sprite = this.parts.sprite;
        const walkKey = animKey(this.spec, 'walk');
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
            // walk or idle based on movement state.
            return;
        }
        const moving = isMovingInput;
        if (moving) {
            if (cur !== walkKey && this.scene.anims.exists(walkKey)) {
                sprite.anims.play(walkKey, true);
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
            const walkKey = animKey(this.spec, 'walk');
            if (this.scene.anims.exists(walkKey)) sprite.anims.play(walkKey, true);
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
        kb.addKey(KEY_FOUR).on('down', () => weapons.switchTo(3));
        kb.addKey(KEY_FIVE).on('down', () => weapons.switchTo(4));
        kb.addKey(KEY_SIX).on('down', () => weapons.switchTo(5));
        kb.addKey(KEY_SEVEN).on('down', () => weapons.switchTo(6));
        kb.addKey(KEY_R).on('down', () => weapons.manualReload());
    }

    // Pointer tracking & magnetic aim assist state
    private rawClientX = 0;
    private rawClientY = 0;
    private lastClientX = 0;
    private lastClientY = 0;
    private lastMouseTime = 0;
    private lockBreakoutUntil = 0;
    private hasPointerMoved = false;
    private currentLockedMonsterId: number | null = null;

    private updateAimTarget(now: number): void {
        if (!this.hasPointerMoved) return;

        const canvas = (this.scene as any).game?.canvas as HTMLCanvasElement | undefined;
        if (!canvas) return;

        const rectEl = canvas.getBoundingClientRect();
        const camera = this.scene.cameras.main;
        if (!rectEl || !camera) return;

        const rawWorldX =
            camera.scrollX + (this.rawClientX - rectEl.left) * (camera.width / rectEl.width);
        const rawWorldY =
            camera.scrollY + (this.rawClientY - rectEl.top) * (camera.height / rectEl.height);

        let finalWorldX = rawWorldX;
        let finalWorldY = rawWorldY;
        let isLocked = false;

        const isBreakout = now < this.lockBreakoutUntil;
        if (isBreakout) {
            this.currentLockedMonsterId = null;
        }

        const monsters: { id: number; x: number; y: number }[] =
            (this.scene as any).monsterSystem?.getActiveMonsters() ?? [];

        if (!isBreakout && monsters.length > 0) {
            // 1. Check if we already have a sticky locked monster that is still valid & within tether distance
            let activeLockedMonster: { id: number; x: number; y: number } | null = null;
            if (this.currentLockedMonsterId !== null) {
                const found = monsters.find((m) => m.id === this.currentLockedMonsterId);
                if (found) {
                    const distToMouse = Math.hypot(found.x - rawWorldX, found.y - rawWorldY);
                    if (distToMouse < AIM_ASSIST.STICKY_TETHER_RADIUS) { // Sticky tether range
                        activeLockedMonster = found;
                    }
                }
            }

            // 2. If no valid sticky target, search for nearest monster within snap radius
            if (!activeLockedMonster) {
                let minDist: number = AIM_ASSIST.INITIAL_SNAP_RADIUS; // Initial snap radius
                for (const m of monsters) {
                    const d = Math.hypot(m.x - rawWorldX, m.y - rawWorldY);
                    if (d < minDist) {
                        minDist = d;
                        activeLockedMonster = m;
                    }
                }
            }

            if (activeLockedMonster) {
                this.currentLockedMonsterId = activeLockedMonster.id;
                finalWorldX = activeLockedMonster.x;
                finalWorldY = activeLockedMonster.y;
                isLocked = true;

                // Mouse Reference 100% Synchronized to Locked Monster Screen Position:
                // When player flicks mouse to break lock, the breakout delta starts DIRECTLY from the monster's body position!
                const monsterScreenX = rectEl.left + (activeLockedMonster.x - camera.scrollX) * (rectEl.width / camera.width);
                const monsterScreenY = rectEl.top + (activeLockedMonster.y - camera.scrollY) * (rectEl.height / camera.height);
                this.rawClientX = monsterScreenX;
                this.rawClientY = monsterScreenY;
            } else {
                this.currentLockedMonsterId = null;
            }
        } else {
            this.currentLockedMonsterId = null;
        }

        this.targetX = finalWorldX;
        this.targetY = finalWorldY;

        // Convert effective aim point to native HUD container coordinates (1536 x 864)
        const hudX = (finalWorldX - camera.scrollX) * (1536 / camera.width);
        const hudY = (finalWorldY - camera.scrollY) * (864 / camera.height);

        EventBus.emit('aim-crosshair-update', {
            x: hudX,
            y: hudY,
            isLocked,
            visible: true,
        });
    }

    private bindPointer(): void {
        const canvas = (this.scene as any).game?.canvas as HTMLCanvasElement | undefined;
        if (!canvas) return;

        const onPointerEvent = (e: PointerEvent) => {
            const now = performance.now();
            if (!this.hasPointerMoved) {
                this.lastClientX = e.clientX;
                this.lastClientY = e.clientY;
                this.rawClientX = e.clientX;
                this.rawClientY = e.clientY;
                this.hasPointerMoved = true;
                this.lastMouseTime = now;
                this.updateAimTarget(now);
                return;
            }

            const dt = Math.max(1, now - this.lastMouseTime);
            const dx = e.clientX - this.lastClientX;
            const dy = e.clientY - this.lastClientY;
            const mouseSpeed = Math.hypot(dx, dy) / dt; // px/ms

            this.lastClientX = e.clientX;
            this.lastClientY = e.clientY;
            this.lastMouseTime = now;

            // Accumulate relative delta onto rawClientX/Y so breakout starts directly from monster anchor
            this.rawClientX += dx;
            this.rawClientY += dy;

            // Acceleration breakout: requires strong/fast mouse flick (> BREAKOUT_SPEED px/ms) to break lock
            if (mouseSpeed > AIM_ASSIST.BREAKOUT_SPEED) {
                this.lockBreakoutUntil = now + AIM_ASSIST.BREAKOUT_DURATION_MS;
            }

            this.updateAimTarget(now);
        };

        const onDown = (e: PointerEvent) => {
            onPointerEvent(e);
            this.firing = true;
        };
        const onMove = (e: PointerEvent) => {
            onPointerEvent(e);
        };
        const stop = () => {
            this.firing = false;
        };
        const onLeave = () => {
            this.firing = false;
            this.hasPointerMoved = false;
            EventBus.emit('aim-crosshair-update', {
                x: -100,
                y: -100,
                isLocked: false,
                visible: false,
            });
        };

        canvas.addEventListener('pointerdown', onDown);
        canvas.addEventListener('pointermove', onMove);
        canvas.addEventListener('pointerup', stop);
        canvas.addEventListener('pointerleave', onLeave);
        this.cleanupFns.push(() => {
            canvas.removeEventListener('pointerdown', onDown);
            canvas.removeEventListener('pointermove', onMove);
            canvas.removeEventListener('pointerup', stop);
            canvas.removeEventListener('pointerleave', onLeave);
        });
    }
}