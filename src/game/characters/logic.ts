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
    KEY_SPACE,
    KEY_SIX,
    KEY_THREE,
    KEY_TWO,
    KEY_W,
    SFX_EVENT,
    AIM_ASSIST,
    DEPTH,
} from '@/lib/constants';
import { getCheats } from '@/lib/dev/cheats';
import { EventBus } from '@/lib/events/bus';
import { appRect, toAppPoint } from '@/lib/mobile';
import type { CharacterSpec } from '@/lib/characters';
import type { Level } from '@/lib/levels/types';
import { useGameStore } from '@/store/game-store';

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
    spaceDown: boolean,
    intent: MoveIntent,
    sp: number,
    spCost: number,
    cooldownMs: number,
    lastDodgeEndAt: number,
    dodgeActiveUntil: number,
    dodgeSpeed: number,
    now: number,
): DodgeIntent | null {
    const canDodge = sp >= spCost && now - lastDodgeEndAt >= cooldownMs && now >= dodgeActiveUntil;
    const hasDirection = intent.vx !== 0 || intent.vy !== 0;
    if (!spaceDown || !hasDirection || !canDodge) return null;
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

/**
 * Pick the nearest monster to (originX, originY) by Euclidean distance.
 * Pure so the controller and tests can share the auto-aim math without
 * booting a Phaser scene. Returns null when the list is empty.
 */
export function pickNearestMonster<T extends { x: number; y: number }>(
    monsters: readonly T[],
    originX: number,
    originY: number,
): T | null {
    if (monsters.length === 0) return null;
    let nearest: T = monsters[0];
    let minDist = Math.hypot(monsters[0].x - originX, monsters[0].y - originY);
    for (let i = 1; i < monsters.length; i++) {
        const m = monsters[i];
        const d = Math.hypot(m.x - originX, m.y - originY);
        if (d < minDist) {
            minDist = d;
            nearest = m;
        }
    }
    return nearest;
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
    cycleSlot(direction: 1 | -1): void;
    manualReload(): void;
    refillActiveAmmo(fraction: number): void;
    swapToWeapon(weaponId: string): boolean;
    getActiveSlotState(): StatusHudState;
    tryPickupWeapon(spec: import('@/lib/weapons').WeaponSpec): 'added' | 'capped';
    replaceSlot(slotIndex: number, spec: import('@/lib/weapons').WeaponSpec): void;
    getMaxSlots(): number;
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
    // Mobile touch state — written by EventBus listeners from
    // TouchControls.tsx, merged into the keyboard intent on each tick.
    // null pointer id == joystick not held.
    private mobileMove: { vx: number; vy: number } | null = null;
    private mobileFiring = false;
    private mobileDodge = false;
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

        const savedHp = useGameStore.getState().hp;
        const savedSp = useGameStore.getState().sp;
        this.hp = typeof savedHp === 'number' && savedHp > 0 ? Math.min(savedHp, spec.hp) : spec.hp;
        this.sp = typeof savedSp === 'number' && savedSp >= 0 ? Math.min(savedSp, spec.sp) : spec.sp;

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
        this.bindMobile();

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
        this.cleanupFns.push(() =>
            EventBus.removeListener('dev:cheat:infiniteHp', infiniteHpHandler),
        );
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
            if (oldHp > 0 && this.hp === 0 && !hpBlocked) {
                this.handleDeath();
            }
            if (actualDelta !== 0 && this.parts.statusHud?.showFloatingNumber) {
                this.parts.statusHud.showFloatingNumber(
                    actualDelta,
                    actualDelta > 0 ? 'heal' : 'damage',
                );
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

    /**
     * Add a weapon (resolved from `weaponsById`) to the next empty
     * slot. Returns `'added'` / `'capped'` / `'unknown'` so the caller
     * (tavern pickup) can decide whether to consume the drop or show
     * the replace-HUD.
     */
    tryPickupWeaponById(
        weaponId: string,
        weaponsById: ReadonlyMap<string, import('@/lib/weapons').WeaponSpec>,
    ): 'added' | 'capped' | 'unknown' {
        const spec = weaponsById.get(weaponId);
        if (!spec) return 'unknown';
        return this.parts.weapons.tryPickupWeapon(spec);
    }

    /** Replace the weapon in `slotIndex` with the spec resolved from
     *  `weaponsById`. Returns false when the index is out of range or
     *  the id is unknown. */
    replaceWeaponSlot(
        slotIndex: number,
        weaponId: string,
        weaponsById: ReadonlyMap<string, import('@/lib/weapons').WeaponSpec>,
    ): boolean {
        const spec = weaponsById.get(weaponId);
        if (!spec) return false;
        this.parts.weapons.replaceSlot(slotIndex, spec);
        return true;
    }

    /** Maximum weapon slots this character can hold (from `weaponMax`). */
    getWeaponMax(): number {
        return this.parts.weapons.getMaxSlots();
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
        const mm = this.mobileMove;
        const intent = moveIntent({
            up: kb.addKey(KEY_W).isDown || (mm?.vy ?? 0) < -0.2,
            down: kb.addKey(KEY_S).isDown || (mm?.vy ?? 0) > 0.2,
            left: kb.addKey(KEY_A).isDown || (mm?.vx ?? 0) < -0.2,
            right: kb.addKey(KEY_D).isDown || (mm?.vx ?? 0) > 0.2,
        });

        // ── Dodge initiation ────────────────────────────────────────
        const spaceDown = kb.addKey(KEY_SPACE).isDown || this.mobileDodge;
        // Edge-triggered: clear the one-frame dodge flag the moment
        // the controller consumes it, so holding the touch button
        // doesn't queue a chain of dodges.
        this.mobileDodge = false;
        const dodge = dodgeIntent(
            spaceDown,
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
        const rawY =
            this.spec.sprite?.offset?.bottom !== undefined
                ? -this.spec.sprite.offset.bottom
                : (this.spec.sprite?.offset?.y ?? 0);
        const offX = rawX * (sprite.flipX ? -1 : 1);
        const offY = rawY;
        sprite.setPosition(pos.x + offX, pos.y + this.spec.body.halfH + offY);
        // Flat depth slot — no Y-sort. The player (added last in scene.ts)
        // draws on top of monsters at the same depth, and the held weapon
        // sprite (DEPTH.WEAPON) sits above this for hand-front occlusion.
        sprite.setDepth(DEPTH.CHARACTER);
        if (this.parts.shadow) {
            this.parts.shadow.setPosition(pos.x, pos.y + this.spec.body.halfH);
            this.parts.shadow.setDepth(DEPTH.CHARACTER - 1);
        }
        if (this.parts.debugBodyRect) {
            this.parts.debugBodyRect.setPosition(pos.x, pos.y);
            this.parts.debugBodyRect.setDepth(DEPTH.CHARACTER + 1);
        }
        if (this.parts.debugHitboxRect) {
            this.parts.debugHitboxRect.setPosition(
                pos.x,
                pos.y + this.spec.body.halfH - sprite.displayHeight / 2,
            );
            this.parts.debugHitboxRect.setDepth(DEPTH.CHARACTER + 2);
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
            this.sp = Math.min(this.spec.sp, this.sp + (this.spec.sp * 16) / this.spec.spRegenMs);
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

        // ── Mobile auto-aim (when FIRE is held on a touch device) ───
        // While the virtual FIRE button is down, override targetX/Y with
        // the nearest live monster every frame so bullets trail the
        // target — independent of the desktop cursor path. When no
        // monster exists, fall back to whatever the cursor set last.
        this.applyMobileAutoAim(pos);

        // ── Weapon update ───────────────────────────────────────────
        // Default aiming target when cursor hasn't moved yet aligns with character's sprite facing (flipX)
        const defaultAimX = pos.x + (sprite.flipX ? -100 : 100);
        const defaultAimY = pos.y - this.spec.body.halfH;

        this.parts.weapons.update(
            now,
            this.targetX ?? defaultAimX,
            this.targetY ?? defaultAimY,
            (this.firing || this.mobileFiring) && now >= this.dodgeActiveUntil,
            this.spec.body.halfH,
        );

        // ── HUD ─────────────────────────────────────────────────────
        this.parts.hud.update(this.spec, this.hp, this.sp);
        this.parts.weaponHud.draw(this.parts.weapons, this.scene.time.now);
        // Character body position center is at (feetY - halfH).
        // Distance from body.position to sprite top is: displayHeight - halfH
        const topOffset = Math.max(
            this.spec.body.halfH,
            this.parts.sprite.displayHeight - this.spec.body.halfH,
        );
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
        kb.addKey(KEY_SPACE);

        kb.addKey(KEY_ONE).on('down', () => weapons.switchTo(0));
        kb.addKey(KEY_TWO).on('down', () => weapons.switchTo(1));
        kb.addKey(KEY_THREE).on('down', () => weapons.switchTo(2));
        kb.addKey(KEY_FOUR).on('down', () => weapons.switchTo(3));
        kb.addKey(KEY_FIVE).on('down', () => weapons.switchTo(4));
        kb.addKey(KEY_SIX).on('down', () => weapons.switchTo(5));
        kb.addKey(KEY_SEVEN).on('down', () => weapons.switchTo(6));
        kb.addKey(KEY_R).on('down', () => weapons.manualReload());
    }

    /**
     * Subscribe to touch-control events emitted by `TouchControls.tsx`.
     * Auto-aim lives in `update()`'s `applyMobileAutoAim` so it tracks
     * the nearest monster every frame the FIRE button is held —
     * independent of the desktop cursor path.
     */
    private bindMobile(): void {
        const onMove = (payload?: { vx?: number; vy?: number } | null) => {
            if (!payload || (payload.vx === 0 && payload.vy === 0)) {
                this.mobileMove = null;
            } else {
                this.mobileMove = { vx: payload.vx ?? 0, vy: payload.vy ?? 0 };
            }
        };
        const onFiring = (payload?: boolean) => {
            const wasFiring = this.mobileFiring;
            this.mobileFiring = payload === true;
            // Mirror desktop `pointerleave`: hide the crosshair on
            // FIRE release so the lock indicator doesn't linger on
            // screen after the player lets go.
            if (wasFiring && !this.mobileFiring) {
                EventBus.emit('aim-crosshair-update', {
                    x: -100,
                    y: -100,
                    isLocked: false,
                    visible: false,
                });
            }
        };
        const onDodge = (payload?: boolean) => {
            // Edge-trigger: only set when the touch starts; release
            // is a no-op (the controller clears the flag on consume).
            if (payload === true) this.mobileDodge = true;
        };

        EventBus.on('mobile:move', onMove);
        EventBus.on('mobile:firing', onFiring);
        EventBus.on('mobile:dodge', onDodge);
        EventBus.on('mobile:weapon:switch', (payload?: { index?: number }) => {
            const idx = payload?.index;
            if (typeof idx === 'number' && idx >= 0) this.parts.weapons.switchTo(idx);
        });
        this.cleanupFns.push(() => {
            EventBus.removeListener('mobile:move', onMove);
            EventBus.removeListener('mobile:firing', onFiring);
            EventBus.removeListener('mobile:dodge', onDodge);
            EventBus.removeListener('mobile:weapon:switch');
        });
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

    /**
     * While the mobile FIRE button is held, override `targetX/Y` with
     * the live position of the nearest monster each frame so bullets
     * chase the target even after they spawn. Re-emits the crosshair
     * event so the on-screen reticle follows.
     *
     * No-op when `mobileFiring` is false (desktop path unchanged) or
     * when no monsters are alive (targetX/Y keep their last value, then
     * weapons.update falls through to `defaultAimX/Y` on the next frame).
     */
    private applyMobileAutoAim(pos: { x: number; y: number }): void {
        if (!this.mobileFiring) return;
        const monsters: { id: number; x: number; y: number }[] =
            (this.scene as any).monsterSystem?.getActiveMonsters() ?? [];
        const target = pickNearestMonster(monsters, pos.x, pos.y);
        if (!target) return;

        this.targetX = target.x;
        this.targetY = target.y;

        // Mirror the desktop path's crosshair emit so the on-screen
        // reticle tracks the lock target.
        const camera = this.scene.cameras.main;
        if (camera) {
            const hudX = (target.x - camera.scrollX) * (1536 / camera.width);
            const hudY = (target.y - camera.scrollY) * (864 / camera.height);
            EventBus.emit('aim-crosshair-update', {
                x: hudX,
                y: hudY,
                isLocked: true,
                visible: true,
            });
        }
    }

    private updateAimTarget(now: number): void {
        if (!this.hasPointerMoved) return;

        const canvas = (this.scene as any).game?.canvas as HTMLCanvasElement | undefined;
        if (!canvas) return;

        const rectEl = appRect(canvas);
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
                    if (distToMouse < AIM_ASSIST.STICKY_TETHER_RADIUS) {
                        // Sticky tether range
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
                const monsterScreenX =
                    rectEl.left +
                    (activeLockedMonster.x - camera.scrollX) * (rectEl.width / camera.width);
                const monsterScreenY =
                    rectEl.top +
                    (activeLockedMonster.y - camera.scrollY) * (rectEl.height / camera.height);
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
            // App space — on mobile the whole app is rotated 90°, so raw
            // clientX/Y would aim at right angles to the cursor.
            const p = toAppPoint(e.clientX, e.clientY);
            if (!this.hasPointerMoved) {
                this.lastClientX = p.x;
                this.lastClientY = p.y;
                this.rawClientX = p.x;
                this.rawClientY = p.y;
                this.hasPointerMoved = true;
                this.lastMouseTime = now;
                this.updateAimTarget(now);
                return;
            }

            const dt = Math.max(1, now - this.lastMouseTime);
            const dx = p.x - this.lastClientX;
            const dy = p.y - this.lastClientY;
            const mouseSpeed = Math.hypot(dx, dy) / dt; // px/ms

            this.lastClientX = p.x;
            this.lastClientY = p.y;
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
        canvas.addEventListener('pointerup', stop);
        canvas.addEventListener('pointerleave', onLeave);

        // Window-level pointermove: any HUD overlay (weapon slots,
        // character hub, joystick, etc.) sits on top of the canvas with
        // `pointer-events: auto`, so canvas pointermove stops firing the
        // moment the cursor enters them. Window listeners keep aim
        // tracking continuous regardless of which DOM layer the cursor
        // happens to be in.
        //
        // Filter by viewport position rather than DOM ancestry: HUD
        // overlays aren't children of `#game-container` (they're siblings
        // inside `#app`), so a contains() check would reject them. We
        // accept the event whenever the cursor sits inside the canvas's
        // visible rect — which naturally includes all canvas-stacked
        // HUD chrome and naturally excludes the editor panel.
        const onWindowMove = (e: PointerEvent): void => {
            const r = appRect(canvas);
            if (r.width <= 0 || r.height <= 0) return;
            const { x: cx, y: cy } = toAppPoint(e.clientX, e.clientY);
            if (cx < r.left || cx > r.left + r.width || cy < r.top || cy > r.top + r.height) return;
            onPointerEvent(e);
        };
        window.addEventListener('pointermove', onWindowMove);
        window.addEventListener('pointerleave', onLeave);

        this.cleanupFns.push(() => {
            canvas.removeEventListener('pointerdown', onDown);
            canvas.removeEventListener('pointerup', stop);
            canvas.removeEventListener('pointerleave', onLeave);
            window.removeEventListener('pointermove', onWindowMove);
            window.removeEventListener('pointerleave', onLeave);
        });
    }

    /**
     * React to HP reaching 0 from a positive value. Flips the UI store
     * flag (the React <DeathOverlay> watches it) and pauses the Phaser
     * scene so the world freezes while the player decides to restart.
     *
     * Restart is handled by React: the overlay button calls
     * `restartSceneWith` with the cached ResolvedScene — the LoadScene
     * constructor reseeds HP from the spec.
     */
    private handleDeath(): void {
        useGameStore.getState().setDead(true);
        EventBus.emit('player-died');
        // Pause stops the matter physics step + animation ticks. The
        // scene remains in memory; restart rebuilds it.
        this.scene.scene.pause();
    }
}
