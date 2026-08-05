/**
 * src/game/monsters/monster.ts
 * --------------------------------------------------------------------------
 * Monsters module — entity + controller + projectile + drop roller in one
 * file. Pure helpers (distBetween / dirTo / decideAIState / chaseVelocity /
 * pickClosestMonster) live in `./logic.ts`.
 *
 *   - Monster: one monster entity (body + visual + HP + AI state + weapon).
 *   - MonsterController: scene-side orchestrator. Self-spawns monsters
 *     from a spawn array, runs per-frame AI tick, fires the monster's
 *     weapon (delegated to the shared `weapons/` module).
 *   - fireProjectile: shared projectile factory (reused from weapons/).
 *   - rollDrops: monster death drop table roller (independent Bernoulli).
 *
 * Monster attacks are routed through the weapons/ module so the same
 * projectile physics, wall policy, and visual style apply. The only
 * difference is the trigger: monsters auto-fire on cooldown; the player
 * fires on click.
 */

import * as Phaser from 'phaser';

import {
    CAT,
    PROJECTILE_MONSTER_MASK,
    COMBAT_PLAYER_DAMAGE_COOLDOWN_MS,
    MONSTER_DEATH_FADE_MS,
    SFX_EVENT,
} from '@/lib/constants';
import { getCheats } from '@/lib/dev/cheats';
import { EventBus } from '@/lib/events/bus';
import type { WeaponSpec } from '@/lib/weapons';
import { spawnProjectile, spawnMeleeHitbox } from '@/game/weapons/weapon';
import { WeaponVisualController } from '@/game/weapons/visual';
import {
    advanceSpawnQueue,
    type AliveSnapshot,
    type PendingSpawn,
} from '@/game/monsters/spawn-queue';
import type { MonsterTrigger } from '@/lib/levels';
import type { DropRef, MonsterSpec } from '@/lib/monsters';
import { StatusHud } from '@/game/hubs/status-hud';
import { useGameStore, type MonsterSystemSnapshot } from '@/store/game-store';

import {
    chaseVelocity,
    decideAIState,
    dirTo,
    distBetween,
    isWaypointReached,
    pickClosestMonster,
    PathfindingService,
    calcSeparationForce,
    getSurroundOffset,
} from './logic';

// ─── Entity ──────────────────────────────────────────────────────────────

export type MonsterState = 'idle' | 'chase' | 'attack' | 'dying';

export function textureKey(spec: MonsterSpec): string {
    return `monster:${spec.id ?? spec.name}`;
}

export function animKey(spec: MonsterSpec, animName: string): string {
    return `${textureKey(spec)}:${animName}`;
}

export function loadMonsterAssets(
    scene: Pick<Phaser.Scene, 'load'>,
    specs: Iterable<MonsterSpec>,
    getSpriteCell: (spec: MonsterSpec) => Promise<{ width: number; height: number }>,
): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const spec of specs) {
        if (!spec.sprite) continue;
        const key = textureKey(spec);
        const url = spec.sprite.texture.startsWith('/')
            ? spec.sprite.texture
            : `/${spec.sprite.texture}`;
        promises.push(
            getSpriteCell(spec).then((cell) => {
                scene.load.spritesheet(key, url, {
                    frameWidth: cell.width,
                    frameHeight: cell.height,
                });
            }),
        );
    }
    return Promise.all(promises).then(() => undefined);
}

export function createMonsterAnims(
    scene: Pick<Phaser.Scene, 'anims'>,
    specs: Iterable<MonsterSpec>,
): void {
    for (const spec of specs) {
        if (!spec.anims) continue;
        for (const [name, anim] of Object.entries(spec.anims)) {
            const key = animKey(spec, name);
            if (scene.anims.exists(key)) scene.anims.remove(key);
            const texture = textureKey(spec);
            const frames: Phaser.Types.Animations.AnimationFrame[] = [];
            for (let i = anim.frames[0]; i <= anim.frames[1]; i++) {
                frames.push({ key: texture, frame: i });
            }
            scene.anims.create({
                key,
                frames,
                frameRate: anim.frameRate,
                repeat: anim.repeat,
            });
        }
    }
}

export class Monster {
    readonly spec: MonsterSpec;
    readonly weapon: WeaponSpec;
    readonly body: MatterJS.BodyType;
    readonly rect: Phaser.GameObjects.Rectangle;
    readonly debugBodyRect: Phaser.GameObjects.Rectangle;
    readonly debugHitboxRect: Phaser.GameObjects.Rectangle;
    readonly sprite?: Phaser.GameObjects.Sprite;
    readonly shadow: Phaser.GameObjects.Ellipse;
    readonly hitboxWidth: number;
    readonly hitboxHeight: number;
    /** Floating HP bar / name label above the monster. Built once and kept alive
     * through the `dying` state (visibility toggled instead of destroyed) so the
     * death animation can show 0 HP without re-spawning the HUD mid-tween. */
    readonly statusHud: StatusHud;
    /** Floating weapon attachment (sprite + aim rotation + recoil/swing tweens).
     * Mirrors `WeaponController.visualController` on the player so monsters
     * visually hold their weapon the same way. Always created; `setWeapon`
     * leaves the sprite null when the weapon has no `visual.texture`, but
     * the controller is still callable for animation triggers (swing). */
    readonly weaponVisual: WeaponVisualController;
    hp: number;
    state: MonsterState = 'idle';
    lastAttackAt = 0;
    lastHitAt = 0;
    /** Set by MonsterController when killed — used to suppress further collisions. */
    dead = false;
    hitboxBody?: MatterJS.BodyType;
    /** One-shot guard so the aggro growl only fires once per monster. */
    hasAggroed = false;
    /** Waypoints for pathfinding navigation. */
    path: { x: number; y: number }[] | null = null;
    currentWaypointIdx = 0;
    lastPathRecalcAt = 0;
    lastRecalcTargetPos = { x: 0, y: 0 };
    /** Stuck detection and emergency pathing recovery fields. */
    stuckCheckPos = { x: 0, y: 0 };
    stuckTicks = 0;
    lastStuckCheckAt = 0;
    noLoSUntil = 0;
    /** When > now (ms), the collision handler is driving this monster's
     *  velocity directly (Matter collisionstart fired). The per-frame
     *  velocity loop skips its LERP / targetDir work for the duration
     *  so the escape direction isn't immediately overwritten. */
    wallEscapeUntil = 0;
    /** Wave identifier from the level spawn entry — used by `clear`
     *  triggers that wait on a specific wave. Undefined for spawns that
     *  aren't part of a named wave. */
    waveId?: string;
    /** Visual tint per weapon kind — derived from weapon (ranged/melee). */
    static readonly TINT_MELEE = 0xef4444;
    static readonly TINT_RANGED = 0xa855f7;

    constructor(
        scene: Phaser.Scene,
        spec: MonsterSpec,
        weapon: WeaponSpec,
        x: number,
        y: number,
        waveId?: string,
    ) {
        this.spec = spec;
        this.weapon = weapon;
        this.hp = spec.hp;
        this.stuckCheckPos = { x, y };
        this.waveId = waveId;

        // Hitbox (Red Box): full sprite frame size for bullet & attack collisions
        let hw = spec.body.halfW * 2;
        let hh = spec.body.halfH * 2;

        if (spec.sprite && scene.textures.exists(textureKey(spec))) {
            const frame = scene.textures.getFrame(textureKey(spec), 0);
            const scale = spec.sprite.scale ?? 1.0;
            if (frame) {
                hw = frame.width * scale * 0.8;
                hh = frame.height * scale;
            }
        }

        this.hitboxWidth = hw;
        this.hitboxHeight = hh;

        // Bodybox (Green Box): in the footer
        const bw = spec.body.halfW * 2;
        const bh = spec.body.halfH * 2;
        const centerY = y;

        this.body = scene.matter.add.rectangle(x, centerY, bw, bh, {
            label: 'monster',
            friction: 0,
            frictionStatic: 0,
            frictionAir: 0.02,
            restitution: 0,
            chamfer: { radius: Math.min(8, Math.min(bw, bh) / 4) },
            collisionFilter: {
                category: CAT.MONSTER_MELEE,
                mask: CAT.CHARACTER | CAT.BULLET | (CAT.WALL_TALL | CAT.WALL_SHORT),
            },
        });

        // Hitbox Sensor (Red Box): full sprite dimensions for bullet hits & attacks
        const hitCenterY = y - hh / 2;
        this.hitboxBody = scene.matter.add.rectangle(x, hitCenterY, hw, hh, {
            label: 'monster-hitbox',
            isSensor: true,
            collisionFilter: {
                category: CAT.MONSTER_MELEE,
                mask: CAT.BULLET,
            },
        });
        (this.body as any).monsterRef = this;
        (this.hitboxBody as any).monsterRef = this;

        const matter = (Phaser as any).Physics.Matter.Matter;
        matter.Body.setInertia(this.body, Infinity);

        // Foot shadow based on hit box size
        this.shadow = scene.add.ellipse(
            x,
            y,
            spec.body.halfW * 2,
            spec.body.halfH * 0.8,
            0x000000,
            0.3,
        );

        // Status HUD above monster hitbox
        this.statusHud = new StatusHud(scene, this.body);

        // Weapon visual attachment — mirrors how the player carries weapons.
        // Always created so melee (swing) and ranged (recoil) share the same
        // animation path. `setWeapon` skips the sprite if `visual.texture`
        // is missing, leaving only the controller (invisible but callable).
        this.weaponVisual = new WeaponVisualController(scene);
        this.weaponVisual.setWeapon(weapon);

        // Feet Body Debug Rect (Green outline)
        this.debugBodyRect = scene.add.rectangle(x, y, spec.body.halfW * 2, spec.body.halfH * 2);
        this.debugBodyRect.setStrokeStyle(2, 0x22c55e, 1);
        this.debugBodyRect.setDepth(9999);
        this.debugBodyRect.setVisible(false);

        // Full Hitbox Debug Rect (Red outline for all Hitboxes)
        const hitboxTint = 0xef4444;
        this.debugHitboxRect = scene.add.rectangle(x, centerY, hw, hh, hitboxTint, 0.25);
        this.debugHitboxRect.setStrokeStyle(2, hitboxTint, 1);
        this.debugHitboxRect.setDepth(10000);
        this.debugHitboxRect.setVisible(false);

        this.rect = this.debugHitboxRect;

        if (spec.sprite && scene.textures.exists(textureKey(spec))) {
            const spriteObj = scene.add.sprite(x, y, textureKey(spec));
            if (spec.sprite.scale) {
                spriteObj.setScale(spec.sprite.scale);
            }

            const idleKey = animKey(spec, 'idle');
            if (scene.anims.exists(idleKey)) {
                spriteObj.play(idleKey);
            }
            this.sprite = spriteObj;
        }
    }

    position(): { x: number; y: number } {
        return this.body.position;
    }

    /** Calculate clearance radius using full physical Hitbox dimensions x 2. */
    getHitboxRadius(): number {
        return Math.hypot(this.hitboxWidth, this.hitboxHeight) * 2;
    }

    destroy(scene: Phaser.Scene): void {
        scene.matter.world.remove(this.body);
        if (this.hitboxBody) {
            scene.matter.world.remove(this.hitboxBody);
        }
        this.debugBodyRect?.destroy();
        this.debugHitboxRect?.destroy();
        this.sprite?.destroy();
        this.shadow?.destroy();
        this.statusHud?.destroy();
        this.weaponVisual?.destroy?.();
        this.dead = true;
    }
}

// ─── Drop roller ─────────────────────────────────────────────────────────

export interface RolledDrop {
    dropId: string;
    spec: unknown; // DropSpec — resolved at the call site
}

/** Roll each entry independently; return all that succeed. */
export function rollDrops(table: DropRef[], byId: (id: string) => unknown): RolledDrop[] {
    const out: RolledDrop[] = [];
    for (const entry of table) {
        if (Math.random() < entry.chance) {
            out.push({ dropId: entry.dropId, spec: byId(entry.dropId) });
        }
    }
    return out;
}

// ─── Controller ──────────────────────────────────────────────────────────

export interface MonsterControllerCallbacks {
    /** Called when a monster dies (HP ≤ 0). Useful for drop rolling. */
    onMonsterDied: (monster: Monster) => void;
    /**
     * Called when the player takes damage from a monster's projectile.
     * The HP application lives in the character module; here we just notify.
     */
    onPlayerHit: (damage: number) => void;
}

/** Snapshot of a monster projectile — owns body + visual + damage. */
export interface MonsterProjectile {
    body: MatterJS.BodyType;
    rect:
    | Phaser.GameObjects.Shape
    | Phaser.GameObjects.Sprite
    | Phaser.GameObjects.Image
    | Phaser.GameObjects.Graphics;
    damage: number;
    monster: Monster;
    /** Spawn point of the projectile (world coords). The per-frame
     *  cleanup compares the bullet's current position against this to
     *  retire ones that fly past their effective range instead of
     *  lingering forever in the world. */
    originX: number;
    originY: number;
    /** Effective range inherited from the firing weapon spec. The
     *  bullet self-destructs once it's travelled this far from the
     *  spawn point, mirroring how WeaponController cleans up
     *  player bullets (logic.ts "speed < 1.0 || distSq >= maxDistance²"). */
    maxDistance: number;
    /** Foot-Y of the firing monster at spawn time. The per-frame sync
     *  loop tracks the firing monster's *current* footY so the bullet
     *  stays in its owner's depth slot as the monster moves; this
     *  pinned value is the fallback once the monster dies or starts
     *  dying mid-flight (no owner to track). */
    fireFootY: number;
    /** Mirror of BulletRecord.spawnAt / lifeMs — populated by the
     *  ranged-path spawn call so the per-frame cleanup can expire
     *  missed shots instead of waiting for Matter friction to drop
     *  speed below the 1.0 px/frame threshold. */
    spawnAt: number;
    lifeMs: number;
}

export class MonsterController {
    private readonly scene: Phaser.Scene;
    private readonly monsters: Monster[] = [];
    private readonly projectiles: MonsterProjectile[] = [];
    private readonly cb: MonsterControllerCallbacks;
    /** Cached for fast lookup in attack tests. */
    private playerBody: MatterJS.BodyType;
    private readonly matter: any;
    private readonly pathfinder?: PathfindingService;
    private lastPathCalcAt = 0;
    private lastPlayerPos = { x: 0, y: 0 };
    /** Last attack timestamp per monster — independently tracked to avoid
     *  interleaved races when two monsters fire on the same frame. */
    private lastDamageAt = 0;

    /** Trigger-gated monster spawns awaiting their fire condition. Pairs the
     *  pure `PendingSpawn` (consumed by `advanceSpawnQueue`) with the heavy
     *  spec/weapon handles needed to instantiate the monster at fire time. */
    private pendingSpawns: { pending: PendingSpawn; spec: MonsterSpec; weapon: WeaponSpec }[] = [];

    constructor(
        scene: Phaser.Scene,
        spawns:
            | {
                spec: MonsterSpec;
                weapon: WeaponSpec;
                x: number;
                y: number;
                trigger?: MonsterTrigger;
                waveId?: string;
            }[]
            | undefined,
        playerBody: MatterJS.BodyType,
        cb: MonsterControllerCallbacks,
        pathfinder?: PathfindingService,
    ) {
        this.scene = scene;
        this.playerBody = playerBody;
        this.cb = cb;
        this.matter = (Phaser as any).Physics.Matter.Matter;
        this.pathfinder = pathfinder;
        const monsterSnapshot = useGameStore.getState().activeMonstersSnapshot;
        const activeMonsters = Array.isArray(monsterSnapshot?.activeMonsters)
            ? monsterSnapshot!.activeMonsters
            : Array.isArray(monsterSnapshot)
                ? (monsterSnapshot as any)
                : undefined;

        if (activeMonsters) {
            // Restore active monster entities from snapshot
            for (const snap of activeMonsters) {
                const match = spawns?.find((s) => s.spec.id === snap.specId);
                if (match) {
                    const monster = new Monster(scene, match.spec, match.weapon, snap.x, snap.y, snap.waveId);
                    monster.hp = snap.hp;
                    this.monsters.push(monster);
                }
            }
            // Restore pending spawns queue using saved pendingSpawnIndices
            if (spawns && Array.isArray(monsterSnapshot?.pendingSpawnIndices)) {
                const pendingSet = new Set(monsterSnapshot!.pendingSpawnIndices);
                spawns.forEach((s, index) => {
                    if (pendingSet.has(index) && s.trigger) {
                        this.pendingSpawns.push({
                            pending: {
                                index,
                                type: s.spec.id!,
                                x: s.x,
                                y: s.y,
                                trigger: s.trigger,
                                waveId: s.waveId,
                            },
                            spec: s.spec,
                            weapon: s.weapon,
                        });
                    }
                });
            }
        } else if (spawns) {
            spawns.forEach((s, index) => {
                const trigger = s.trigger;
                // Immediate: no trigger at all, OR `kind: 'time', delayMs: 0`.
                // Branch in two separate checks so TS narrows `trigger` to a
                // non-undefined type after the if/return.
                if (!trigger || (trigger.kind === 'time' && trigger.delayMs === 0)) {
                    this.monsters.push(new Monster(scene, s.spec, s.weapon, s.x, s.y, s.waveId));
                    return;
                }
                this.pendingSpawns.push({
                    pending: {
                        index,
                        type: s.spec.id!,
                        x: s.x,
                        y: s.y,
                        trigger,
                        waveId: s.waveId,
                    },
                    spec: s.spec,
                    weapon: s.weapon,
                });
            });
        }

        this.bindCollisions();
    }

    /**
     * Swap the player body reference. Used by the tavern UI to rewire
     * monsters / collisions to a freshly-spawned character after the
     * player picks a new one — the `playerBody` field is otherwise
     * captured once at construction.
     */
    public setPlayerBody(body: MatterJS.BodyType): void {
        this.playerBody = body;
    }

    /** Export fine-grained snapshot of active monsters and remaining pending spawn queue. */
    public getSnapshot(): MonsterSystemSnapshot {
        const activeMonsters = this.monsters
            .filter((m) => !m.dead && m.state !== 'dying')
            .map((m) => ({
                specId: m.spec.id!,
                hp: m.hp,
                x: m.body.position.x,
                y: m.body.position.y,
                waveId: m.waveId,
            }));
        const pendingSpawnIndices = this.pendingSpawns.map((p) => p.pending.index);
        return {
            activeMonsters,
            pendingSpawnIndices,
        };
    }

    /** Get active alive monsters positions (hitbox center) for aim assist magnet. */
    public getActiveMonsters(): { id: number; x: number; y: number }[] {
        return this.monsters
            .filter((m) => !m.dead && m.state !== 'dying')
            .map((m, idx) => ({ id: idx, x: m.body.position.x, y: m.body.position.y }));
    }

    /** Editor-only: expose raw Monster handles so the path debug
     *  overlay can read `m.path` / `m.currentWaypointIdx`. Production
     *  code uses the lightweight getActiveMonsters() above. */
    public getDebugMonsters(): readonly Monster[] {
        return this.monsters.filter((m) => !m.dead && m.state !== 'dying');
    }

    /** Check if all monsters in this level are dead and no pending spawns remain. */
    public isAllCleared(): boolean {
        const aliveCount = this.monsters.filter((m) => !m.dead && m.state !== 'dying').length;
        return aliveCount === 0 && this.pendingSpawns.length === 0;
    }

    /**
     * Compute the monster's current foot-Y. Foot position is what the
     * A* waypoints correspond to (rectangle bottom edge), not the body
     * centre. Used as the Y-sort anchor for the sprite / shadow /
     * weapon / bullet / melee stack — keeping the math in one place
     * ensures every visual derives depth from the same value.
     */
    public static computeFootY(m: Monster): number {
        const mp = m.body.position;
        const monsterBodyHalfH = m.spec.body.halfH;
        return Math.round(
            mp.y + (m.sprite ? m.sprite.displayHeight / 2 - monsterBodyHalfH : 0),
        );
    }

    /** Per-frame: AI tick + projectile sync + cleanup. */
    update(time: number): void {
        this.advancePendingSpawns(time);
        const pp = this.playerBody.position;
        const playerMovedDist = distBetween(this.lastPlayerPos, pp);
        const shouldRecalcPaths =
            this.pathfinder && (playerMovedDist > 16 || time - this.lastPathCalcAt > 150);

        if (shouldRecalcPaths) {
            this.lastPathCalcAt = time;
            this.lastPlayerPos = { x: pp.x, y: pp.y };
        }

        const totalMonsters = this.monsters.length;

        for (let i = this.monsters.length - 1; i >= 0; i--) {
            const m = this.monsters[i];
            if (m.dead) {
                this.monsters.splice(i, 1);
                continue;
            }
            const mp = m.body.position;
            const dist = distBetween(mp, pp);
            const dirToPlayer = dirTo(mp, pp);

            // Compute surround target offset around player to prevent crowding single-file
            const surroundOffset = getSurroundOffset(
                i,
                totalMonsters,
                Math.min(28, m.weapon.range * 0.45),
            );
            const targetPos = { x: pp.x + surroundOffset.x, y: pp.y + surroundOffset.y };

            // Dynamic clearance radius based on exact physical Hitbox dimensions
            const monsterBodyRadius = m.getHitboxRadius();
            // Foot position — the A* waypoints correspond to where the
            // monster's FEET stand, not where its body centre sits.
            // The body rectangle extends halfH below mp (the spec
            // positions the rectangle with its top edge at the sprite
            // head and its bottom edge at the feet). Driving the path
            // from the foot position means a waypoint "passes" the
            // wall if the feet fit there — the body clears the wall
            // automatically. Otherwise the path grazes the wall top
            // and the body bottom collides.
            const monsterBodyHalfH = m.spec.body.halfH;
            const footX = mp.x;
            const footY = MonsterController.computeFootY(m);
            const footPos = { x: footX, y: footY - monsterBodyHalfH / 2 };

            // Per-monster Active Stuck Detector — 60ms window so escape fires
            // before the player sees a single bounce. Measures
            // PROGRESS TOWARD THE TARGET rather than raw movedDist:
            // when Matter bounces the body off a wall, raw movedDist
            // stays large (the body reflected, often perpendicular to
            // the wall) so the original < 1.5 px heuristic never
            // trips. A monster bouncing against a wall is making zero
            // progress toward its target, which is exactly what we
            // need to detect.
            let isStuckEmergency = false;
            if (time - m.lastStuckCheckAt >= 60) {
                m.lastStuckCheckAt = time;
                // Progress = how much the monster closed the gap to
                // targetPos in this window. Negative = moving away.
                const fromOld = {
                    x: m.stuckCheckPos.x - targetPos.x,
                    y: m.stuckCheckPos.y - targetPos.y,
                };
                const fromNow = { x: mp.x - targetPos.x, y: mp.y - targetPos.y };
                const oldDist = Math.hypot(fromOld.x, fromOld.y);
                const nowDist = Math.hypot(fromNow.x, fromNow.y);
                const progress = oldDist - nowDist; // > 0 = closing in
                // Threshold: less than 1 px of closing over 60ms
                // (~16.6 px/s) while in chase = stuck. Generous so
                // curving pursuit doesn't false-positive.
                if (m.state === 'chase' && progress < 1.0) {
                    m.stuckTicks++;
                    if (m.stuckTicks >= 1) {
                        isStuckEmergency = true;
                        m.noLoSUntil = time + 2000; // Disable direct LoS shortcut for 2s
                        if (this.pathfinder) {
                            const newPath = this.pathfinder.findPath(
                                footPos,
                                targetPos,
                                m.spec.body.halfW,
                                monsterBodyHalfH,
                            );
                            if (newPath && newPath.length > 1) {
                                m.path = newPath;
                                m.currentWaypointIdx = this.pathfinder.skipBufferZoneWaypoints(
                                    newPath,
                                    1,
                                );
                            }
                        }
                    }
                } else {
                    m.stuckTicks = 0;
                }
                m.stuckCheckPos = { x: mp.x, y: mp.y };
            }

            if (m.state === 'dying') {
                // Freeze physics body during death animation
                this.matter.Body.setVelocity(m.body, { x: 0, y: 0 });
                if (m.statusHud) {
                    const halfH = m.sprite ? m.sprite.displayHeight / 2 : m.spec.body.halfH;
                    m.statusHud.update({ hp: 0, maxHp: m.spec.hp, showHpBar: false }, time, halfH);
                }
                continue;
            }

            // ── AI transitions ─────────────────────────────────────────
            const prevState = m.state;
            // Pass prev state so decideAIState can apply hysteresis —
            // without it, distance jitter around `attackRange` flips
            // chase ↔ attack every frame and the idle/move animation
            // strobes with it.
            const prevAiState: 'chase' | 'attack' = prevState === 'attack' ? 'attack' : 'chase';
            m.state = decideAIState(dist, m.weapon.range, prevAiState);
            // One-shot aggro growl on the first idle → chase transition.
            if (!m.hasAggroed && prevState === 'idle' && m.state === 'chase') {
                m.hasAggroed = true;
                EventBus.emit(SFX_EVENT(m.spec.sfx?.aggro ?? 'monster-aggro'));
            }

            // ── Velocity ──────────────────────────────────────────────
            let desiredVx = 0;
            let desiredVy = 0;
            if (m.state === 'chase') {
                // Per-frame A* path recalc — every chase frame, not
                // every 150 ms. The previous "recalc only when player
                // moved > 16 px OR 150 ms passed" left the monster
                // with a stale (or null) path for most of its life,
                // which is exactly why it kept ramming walls. A* on a
                // 16-px grid is microseconds per monster — the per-
                // frame cost is fine for a handful of monsters.
                // `shouldRecalcPaths` was a perf shortcut that turned
                // out to be a correctness bug.
                if (this.pathfinder) {
                    const distTargetMoved = Math.hypot(
                        targetPos.x - m.lastRecalcTargetPos.x,
                        targetPos.y - m.lastRecalcTargetPos.y,
                    );
                    // Hysteresis Guard: do not replace active path mid-way unless target moved > 48px or stuck
                    const hasFinishedPath = !m.path || m.currentWaypointIdx >= m.path.length;
                    const shouldRecalc =
                        hasFinishedPath ||
                        distTargetMoved > 48 ||
                        isStuckEmergency;

                    if (shouldRecalc) {
                        m.lastPathRecalcAt = time;
                        m.lastRecalcTargetPos = { x: targetPos.x, y: targetPos.y };
                        const canUseLoS = time >= m.noLoSUntil;
                        if (
                            canUseLoS &&
                            this.pathfinder.hasLineOfSight(footPos, targetPos, monsterBodyRadius)
                        ) {
                            m.path = [footPos, targetPos];
                            m.currentWaypointIdx = 1;
                        } else {
                            const path = this.pathfinder.findPath(
                                footPos,
                                targetPos,
                                m.spec.body.halfW,
                                monsterBodyHalfH,
                            );
                            if (path && path.length > 1) {
                                m.path = path;
                                m.currentWaypointIdx = 1;
                            }
                        }
                    }
                }

                // Resolve targetDir in priority order:
                //   1. Direct line-of-sight to targetPos → straight line
                //      (cheapest, smoothest, no need for waypoints).
                //   2. Otherwise → next waypoint along the A* path. The
                //      path is the source of truth for "how do I get
                //      around the wall", not a fallback when LoS fails.
                // The previous version used dirTo(mp, targetPos) as the
                // DEFAULT, then only overrode with the path when LoS was
                // blocked AND a path existed AND the monster hadn't run
                // off the end. That meant in any other case — no path,
                // path complete, LoS clear — the monster reverted to
                // straight-line chase and rammed the wall.
                let targetDir: { x: number; y: number };
                const canUseLoS = time >= m.noLoSUntil;
                const hasLoS =
                    canUseLoS &&
                    (this.pathfinder?.hasLineOfSight(footPos, targetPos, monsterBodyRadius) ?? false);

                if (m.path && m.currentWaypointIdx < m.path.length) {
                    // Smooth waypoint advancement. Reached distance is
                    // bodyHalf + a small breathing-room offset so a
                    // flush waypoint parked against a wall doesn't
                    // perpetually count as "arrived" while the monster
                    // still has the body box clipping the corner.
                    const currWp = m.path[m.currentWaypointIdx];
                    if (currWp) {
                        const distToWp = Math.hypot(footPos.x - currWp.x, footPos.y - currWp.y);
                        if (
                            isWaypointReached(distToWp, monsterBodyHalfH) &&
                            m.currentWaypointIdx < m.path.length - 1
                        ) {
                            m.currentWaypointIdx++;
                        }
                    }
                    const targetWp = m.path[m.currentWaypointIdx] ?? targetPos;
                    targetDir = dirTo(footPos, targetWp);
                } else if (hasLoS) {
                    // Clear sight and no remaining path waypoints → direct straight line
                    targetDir = dirTo(footPos, targetPos);
                } else {
                    targetDir = dirTo(footPos, targetPos);
                }

                const isFollowingPath = !!m.path && m.currentWaypointIdx < m.path.length;

                // Base chase vector
                const cv = chaseVelocity(targetDir, m.spec.moveSpeed);
                desiredVx = cv.vx;
                desiredVy = cv.vy;

                // Separation is intentionally OFF while following a
                // path — when two monsters route through the same
                // corner cell, an extra repulsion push makes them
                // jitter across each other and never reach the
                // waypoint. The path itself keeps them spread across
                // cells; off-path straight-line chases get a small
                // separation force to stop identical-position overlap.
                if (!isFollowingPath) {
                    const sep = calcSeparationForce(
                        m,
                        this.monsters,
                        32,
                        m.spec.moveSpeed * 0.4,
                    );
                    desiredVx += sep.x;
                    desiredVy += sep.y;
                }

                // Anti-blocking Detour: check if an ally directly ahead is stationary / attacking
                for (const ally of this.monsters) {
                    if (ally === m || ally.dead) continue;
                    const allyPos = ally.body.position;
                    const distToAlly = distBetween(mp, allyPos);
                    if (distToAlly < 28) {
                        const dirToAlly = dirTo(mp, allyPos);
                        const dot = targetDir.x * dirToAlly.x + targetDir.y * dirToAlly.y;
                        // Ally is directly in front (dot > 0.6) and is attacking or stopped
                        if (dot > 0.6 && (ally.state === 'attack' || ally.state === 'idle')) {
                            // Tangential detour vector perpendicular to targetDir
                            const sign = i % 2 === 0 ? 1 : -1;
                            const detourX = -targetDir.y * sign * m.spec.moveSpeed * 0.6;
                            const detourY = targetDir.x * sign * m.spec.moveSpeed * 0.6;
                            desiredVx += detourX;
                            desiredVy += detourY;
                            break;
                        }
                    }
                }

                // Emergency Escape: if stuck, disable direct LoS shortcut and force fresh A* path
                if (isStuckEmergency || m.stuckTicks >= 2) {
                    m.noLoSUntil = time + 2000;
                    m.path = null;
                    m.stuckTicks = 0;
                }

                // Cap total desired velocity to preserve move speed limit
                const speed = Math.hypot(desiredVx, desiredVy);
                const maxAllowedSpeed = m.spec.moveSpeed * 1.15;
                if (speed > maxAllowedSpeed) {
                    desiredVx = (desiredVx / speed) * maxAllowedSpeed;
                    desiredVy = (desiredVy / speed) * maxAllowedSpeed;
                }
            } else {
                m.path = null;
                m.currentWaypointIdx = 0;
            }

            // Direct Velocity Execution when following A* path (100% path commitment, no wall friction)
            const isFollowingPath = !!m.path && m.currentWaypointIdx < m.path.length;
            if (isFollowingPath && time >= m.wallEscapeUntil) {
                this.matter.Body.setVelocity(m.body, { x: desiredVx, y: desiredVy });
            } else if (time >= m.wallEscapeUntil) {
                const currVx = m.body.velocity.x;
                const currVy = m.body.velocity.y;
                const lerpFactor = 0.22;
                const finalVx = currVx + (desiredVx - currVx) * lerpFactor;
                const finalVy = currVy + (desiredVy - currVy) * lerpFactor;
                this.matter.Body.setVelocity(m.body, { x: finalVx, y: finalVy });
            }

            // ── Attack tick ──────────────────────────────────────────
            if (m.state === 'attack' && time - m.lastAttackAt >= m.weapon.cooldownMs) {
                this.performAttack(m, dirToPlayer, footY);
                m.lastAttackAt = time;
            }

            // ── Visual sync & animation ───────────────────────────────
            // Align feet shadow and green debug rect with actual feet position
            m.shadow.setPosition(footX, footY);
            m.shadow.setDepth(footY - 1);
            m.debugBodyRect.setPosition(footX, footY - m.spec.body.halfH);

            if (m.sprite) {
                // Calculate visual offset. `left` shifts right (+) / left (-), `bottom` shifts up (-) / down (+)
                const rawX = m.spec.sprite?.offset?.left ?? m.spec.sprite?.offset?.x ?? 0;
                const rawY =
                    m.spec.sprite?.offset?.bottom !== undefined
                        ? -m.spec.sprite.offset.bottom
                        : (m.spec.sprite?.offset?.y ?? 0);
                const offX = rawX * (m.sprite.flipX ? -1 : 1);
                const offY = rawY;

                // Align sprite with feet and apply offset
                m.sprite.setPosition(mp.x + offX, mp.y + offY);
                m.sprite.setDepth(footY);

                // Align Editor debug rect & sensor hitbox directly with sprite position
                m.debugHitboxRect.setPosition(mp.x + offX, mp.y + offY);
                if (m.hitboxBody) {
                    this.matter.Body.setPosition(m.hitboxBody, { x: mp.x + offX, y: mp.y + offY });
                }

                // Update status HUD above monster Red Hitbox top edge
                const topOffset = m.hitboxHeight / 2;
                m.statusHud.update(
                    { name: m.spec.name, hp: m.hp, maxHp: m.spec.hp, showHpBar: true },
                    time,
                    topOffset,
                );

                // Play corresponding animation track (idle / move / hit)
                const isHit = time - m.lastHitAt < 250;
                const animTrack = isHit ? 'hit' : m.state === 'chase' ? 'move' : 'idle';
                const currentTrackKey = animKey(m.spec, animTrack);
                if (
                    this.scene.anims.exists(currentTrackKey) &&
                    m.sprite.anims.currentAnim?.key !== currentTrackKey
                ) {
                    m.sprite.play(currentTrackKey);
                }

                // Flip sprite horizontally based on move direction / facing player
                if (dist > 1) {
                    m.sprite.setFlipX(dirToPlayer.x < 0);
                }
            } else {
                m.debugHitboxRect.setPosition(mp.x, mp.y);
                const halfH = m.spec.body.halfH;
                m.statusHud.update({ hp: m.hp, maxHp: m.spec.hp, showHpBar: true }, time, halfH);
                if (dist > 1) {
                    m.debugHitboxRect.setRotation(Math.atan2(dirToPlayer.y, dirToPlayer.x));
                }
            }

            // ── Weapon visual sync (Brotato-style floating attachment) ──
            // Aim the held weapon at the player the same way WeaponController
            // does for the player character. Mirrors player visual behaviour.
            // Pass `footY + 20` (matches DEPTH.WEAPON - DEPTH.CHARACTER on
            // the flat layer) so the weapon sits in front of the monster's
            // bullet and body — sprite < bullet < weapon ordering, same as
            // the player stack.
            if (m.weaponVisual) {
                const handX = mp.x;
                const handY = mp.y;
                const aimAngle = Math.atan2(dirToPlayer.y, dirToPlayer.x);
                m.weaponVisual.update(handX, handY, aimAngle, footY + 20);
            }
        }

        // ── Projectile visual sync + cleanup ──────────────────────────
        // Mirrors WeaponController's bullet lifecycle: retire ranged
        // bullets that have slowed below a small threshold (usually
        // they hit something or slid to a stop against a tall wall) OR
        // flown past their effective range from the spawn point. Without
        // this, missed shots lingered in the world until something else
        // killed them — eventually every level's projectile pool grew
        // unbounded over a long run.
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const proj = this.projectiles[i];
            const bp = proj.body.position;
            const vel = proj.body.velocity;

            // Bullet depth tracks the firing monster's current footY
            // (sprite < bullet < weapon ordering, same as the player).
            // When the owner dies or starts dying mid-flight we can't
            // keep tracking it — pin to the fire-time depth instead so
            // the bullet doesn't snap to depth 0 or stale.
            const owner = proj.monster;
            const ownerAlive = owner && !owner.dead && owner.state !== 'dying';
            const bulletFootY = ownerAlive ? MonsterController.computeFootY(owner) : proj.fireFootY;
            proj.rect.setDepth(bulletFootY + 10);

            proj.rect.setPosition(bp.x, bp.y);
            proj.rect.setRotation(Math.atan2(vel.y, vel.x));

            const currentSpeed = Math.hypot(vel.x, vel.y);
            const dx = bp.x - proj.originX;
            const dy = bp.y - proj.originY;
            const distSq = dx * dx + dy * dy;
            // Hard cap on lifetime (per-weapon via projectile.lifeMs,
            // default 1500ms) — kills missed shots that would otherwise
            // linger ~4-10s while Matter friction decays speed.
            const expired = time - proj.spawnAt >= proj.lifeMs;
            if (expired || currentSpeed < 1.0 || distSq >= proj.maxDistance * proj.maxDistance) {
                this.destroyProjectile(proj);
            }
        }
    }

    /** Apply damage from a player bullet to a specific monster (or AoE later). */
    applyBulletDamage(bulletDamage: number, hitBody: MatterJS.BodyType): void {
        // Find monster whose main body or compound parts match hitBody
        const target =
            this.monsters.find((m) => {
                if (m.dead || m.state === 'dying') return false;
                if (m.body === hitBody) return true;
                // Check compound parts if any (includes spriteHitbox sensor)
                const parts = (m.body as any).parts;
                if (Array.isArray(parts) && parts.includes(hitBody)) return true;
                // Fallback: check parent
                if ((hitBody as any).parent === m.body) return true;
                return false;
            }) ?? pickClosestMonster(hitBody.position, this.monsters, 200);

        if (target && target.state !== 'dying') {
            const finalDamage = getCheats().oneHitKill ? 999999 : bulletDamage;
            target.hp -= finalDamage;
            target.lastHitAt = this.scene.time.now;
            target.statusHud.showFloatingNumber(finalDamage, 'damage');
            EventBus.emit(SFX_EVENT(target.spec.sfx?.hit ?? 'monster-hit'), {
                key: `monster:${target.spec.id}`,
                throttleMs: target.spec.sfx?.throttleMs,
            });

            if (target.hp <= 0) {
                this.kill(target);
            }
        }
    }

    setDebugVisible(visible: boolean): void {
        for (const m of this.monsters) {
            m.debugBodyRect.setVisible(visible);
            m.debugHitboxRect.setVisible(visible);
        }
    }

    destroy(): void {
        for (const m of this.monsters) m.destroy(this.scene);
        for (const p of this.projectiles) {
            this.scene.matter.world.remove(p.body);
            p.rect.destroy();
        }
        this.monsters.length = 0;
        this.projectiles.length = 0;
    }

    // ─── internals ──────────────────────────────────────────────────────

    private performAttack(
        m: Monster,
        dirToPlayer: { x: number; y: number },
        footY: number,
    ): void {
        const weapon = m.weapon;
        const projectile = weapon.projectile;
        const isMelee = projectile === undefined;

        // Melee: trigger the swing tween (same animation the player gets)
        // AND spawn a sensor hitbox so the swing has a proper hit-zone that
        // matches player melee behaviour (slash arc + sensor body in front
        // of the monster). Contact damage on the body itself is also kept
        // as a fallback for the rare case where the player walks into the
        // monster between swings.
        if (isMelee) {
            m.weaponVisual.triggerSwing();
            const swingSfx = weapon.sfx?.shoot;
            if (swingSfx) EventBus.emit(SFX_EVENT(swingSfx));
            const range = weapon.range;
            const originX = m.body.position.x;
            const originY = m.body.position.y;
            const dx = dirToPlayer.x;
            const dy = dirToPlayer.y;
            const len = Math.hypot(dx, dy);
            const angle = len > 0 ? Math.atan2(dy, dx) : 0;
            spawnMeleeHitbox(this.scene, this.matter, {
                origin: { x: originX, y: originY },
                angle,
                range,
                hitWidth: weapon.hitWidth ?? range,
                hitHeight: weapon.hitHeight ?? range,
                damage: weapon.damage,
                texture: weapon.bullet?.texture,
                scale: weapon.bullet?.scale ?? 0.2,
                rotationOffset: weapon.bullet?.rotationOffset,
                swingAngle: weapon.visual?.swingAngle,
                category: CAT.MONSTER_PROJECTILE,
                mask: PROJECTILE_MONSTER_MASK,
                label: 'monster-melee',
                // Stack the swing in front of the monster's sprite
                // (sprite < bullet < weapon, mirroring the player's
                // CHARACTER < BULLET < WEAPON depth stack). The +10
                // offset matches DEPTH.BULLET - DEPTH.CHARACTER for
                // the flat layer so a melee arc never draws over its
                // owner's body but always draws under the weapon.
                depth: footY + 10,
            });
            return;
        }

        // Ranged: trigger recoil, spawn projectile from the weapon's muzzle.
        // Don't lead — player dodge makes reaction aim more rewarding than prediction.
        const len = Math.hypot(dirToPlayer.x, dirToPlayer.y);
        if (len === 0) return;
        const { speed, visual: size } = projectile;
        const muzzlePos = m.weaponVisual.getMuzzlePosition(m.body.position.x, m.body.position.y);
        m.weaponVisual.triggerRecoil();
        EventBus.emit(SFX_EVENT(weapon.sfx?.shoot ?? 'monster-shoot'));
        const bullet = spawnProjectile(
            this.scene,
            this.matter,
            { x: muzzlePos.x, y: muzzlePos.y },
            { x: dirToPlayer.x, y: dirToPlayer.y },
            {
                label: 'monster-projectile',
                category: CAT.MONSTER_PROJECTILE,
                mask: PROJECTILE_MONSTER_MASK,
                speed,
                damage: weapon.damage,
                size,
                // Render bullet as a sprite when the weapon spec has one —
                // matches how player bullets look (e.g. assault-bullet.png).
                texture: weapon.bullet?.texture,
                scale: weapon.bullet?.scale,
                anchor: weapon.bullet?.anchor,
                rotationOffset: weapon.bullet?.rotationOffset,
                // Hard cap on lifetime — per-weapon override or default
                // (1500ms) applied in spawnProjectile. Prevents missed
                // shots from lingering ~4-10s on screen while Matter
                // friction decays speed below the cleanup threshold.
                lifeMs: weapon.projectile?.lifeMs,
                // Stack the bullet in front of the monster's sprite.
                // The +10 offset matches DEPTH.BULLET - DEPTH.CHARACTER
                // on the flat layer, so the per-frame sync can keep
                // `bullet depth = owner footY + 10` and preserve the
                // sprite < bullet < weapon ordering as the monster
                // moves.
                depth: footY + 10,
            },
        );
        this.projectiles.push({ ...bullet, monster: m, fireFootY: footY });
    }

    private kill(m: Monster): void {
        m.state = 'dying';
        EventBus.emit(SFX_EVENT(m.spec.sfx?.death ?? 'monster-death'));
        this.updateWaveProgressSave();

        // Hide the held weapon during the death animation so it doesn't
        // float in mid-air beside the corpse.
        m.weaponVisual?.setVisible(false);

        // Disable collision filter so dead monster doesn't block player or bullets
        m.body.collisionFilter.mask = 0;

        // Compute the death-track duration so the fade can run in PARALLEL
        // with the animation, not after. By the time the death anim ends
        // the body is already partly transparent; the tail of the tween
        // finishes the dissolve to 0.
        const deathTrackKey = animKey(m.spec, 'death');
        const hasDeathAnim = !!(m.sprite && this.scene.anims.exists(deathTrackKey));
        if (hasDeathAnim && m.sprite) {
            m.sprite.play(deathTrackKey);
        }
        const animMs = hasDeathAnim ? (this.scene.anims.get(deathTrackKey)?.duration ?? 0) : 0;
        this.startDeathFade(m, animMs);
    }

    /**
     * Tween alpha to 0 over `animMs + MONSTER_DEATH_FADE_MS`, then
     * destroy. The fade runs in parallel with the death animation, so
     * the body starts dissolving the moment the monster dies.
     *
     * onMonsterDied fires at the end of the death animation (so the
     * dropped items appear at the moment the body is half-faded — the
     * "puff of smoke + loot materialises" beat). If there's no death
     * animation, the callback fires immediately and the total fade
     * duration collapses to MONSTER_DEATH_FADE_MS.
     */
    private startDeathFade(m: Monster, animMs: number): void {
        const totalMs = animMs + MONSTER_DEATH_FADE_MS;
        const dropSpawnAt = animMs; // emit onMonsterDied at end of death anim

        if (animMs > 0) {
            this.scene.time.delayedCall(dropSpawnAt, () => this.cb.onMonsterDied(m));
        } else {
            // No death animation — drop loot immediately, fade as the
            // only visible cue.
            this.cb.onMonsterDied(m);
        }

        // Capture the targets now — destroy() will null out the
        // references and a tween against the same handle would no-op.
        // All four GameObject subclasses (Sprite / Ellipse / Rectangle)
        // share the single `alpha: number` property, which is what the
        // tween actually mutates.
        const targets: Phaser.GameObjects.GameObject[] = [];
        if (m.sprite) targets.push(m.sprite);
        if (m.shadow) targets.push(m.shadow);
        if (m.debugBodyRect) targets.push(m.debugBodyRect);
        if (m.debugHitboxRect) targets.push(m.debugHitboxRect);
        if (targets.length === 0) {
            m.destroy(this.scene);
            return;
        }

        this.scene.tweens.add({
            targets,
            alpha: 0,
            duration: totalMs,
            ease: 'Linear',
            onComplete: () => m.destroy(this.scene),
        });
    }

    /**
     * Per-frame: advance the trigger-gated spawn queue. Builds an
     * alive snapshot grouped by waveId, hands it to the pure reducer,
     * instantiates any spawns that fire, and updates the surviving
     * queue with refreshed `clearReadyAt` stamps.
     */
    private advancePendingSpawns(time: number): void {
        if (this.pendingSpawns.length === 0) return;

        // Build alive snapshot: count non-dead/non-dying monsters per waveId.
        // Empty-string bucket holds spawns without a waveId.
        const byWave: Record<string, number> = {};
        for (const m of this.monsters) {
            if (m.dead || m.state === 'dying') continue;
            const w = m.waveId ?? '';
            byWave[w] = (byWave[w] ?? 0) + 1;
        }
        const alive: AliveSnapshot = { byWave };

        const pendingList = this.pendingSpawns.map((q) => q.pending);
        const { fired, remaining } = advanceSpawnQueue(pendingList, time, alive);

        // Instantiate fired spawns + keep survivors with updated clearReadyAt.
        const remainingByIndex = new Map<number, PendingSpawn>();
        for (const p of remaining) remainingByIndex.set(p.index, p);
        this.pendingSpawns = this.pendingSpawns.filter((q) => {
            const isFired = fired.some((p) => p.index === q.pending.index);
            if (isFired) {
                this.monsters.push(
                    new Monster(
                        this.scene,
                        q.spec,
                        q.weapon,
                        q.pending.x,
                        q.pending.y,
                        q.pending.waveId,
                    ),
                );
                return false;
            }
            const refreshed = remainingByIndex.get(q.pending.index);
            // Mirror back every field the queue may have updated. The
            // queue returns fresh spread copies; without this both
            // clearReadyAt AND hasSeenAlive stay frozen on the original
            // pending object, which breaks clear-trigger gating
            // (hasSeenAlive never flips → clear spawns never fire).
            if (refreshed) {
                q.pending.clearReadyAt = refreshed.clearReadyAt;
                q.pending.hasSeenAlive = refreshed.hasSeenAlive;
            }
            return true;
        });

        this.updateWaveProgressSave();
    }

    private updateWaveProgressSave(): void {
        const levelId = (this.scene as any).id;
        if (!levelId) return;

        // Active waves still alive or pending
        const activeWaveIds = new Set<string>();
        for (const m of this.monsters) {
            if (!m.dead && m.state !== 'dying' && m.waveId) {
                activeWaveIds.add(m.waveId);
            }
        }
        for (const p of this.pendingSpawns) {
            if (p.pending.waveId) {
                activeWaveIds.add(p.pending.waveId);
            }
        }

        const existing = useGameStore.getState().levelProgressMap[levelId];
        const cleared = new Set<string>(existing?.clearedWaveIds ?? []);
        let changed = false;

        // Check if any wave previously spawned has now completely cleared
        for (const m of this.monsters) {
            if (m.waveId && !activeWaveIds.has(m.waveId) && !cleared.has(m.waveId)) {
                cleared.add(m.waveId);
                changed = true;
            }
        }

        if (changed) {
            const clearedList = Array.from(cleared);
            useGameStore.getState().setWaveProgress(levelId, {
                clearedWaveIds: clearedList,
                currentWaveIndex: clearedList.length,
            });
        }
    }

    private bindCollisions(): void {
        this.scene.matter.world.on('collisionstart', (event: any) => {
            const pairs = event.pairs || [];
            for (const pair of pairs) {
                const a = pair.bodyA;
                const b = pair.bodyB;
                if (!a || !b) continue;

                // ── monster-projectile ↔ player / wall ──────────────────
                const projBody =
                    a.label === 'monster-projectile'
                        ? a
                        : b.label === 'monster-projectile'
                            ? b
                            : null;
                if (projBody) {
                    const other = projBody === a ? b : a;
                    if (other === this.playerBody) {
                        this.damagePlayerFromProjectile(projBody as MatterJS.BodyType);
                    } else if (typeof other.label === 'string' && other.label.startsWith('wall:')) {
                        // Tall wall collision — short walls don't appear
                        // here because the projectile mask omits WALL_SHORT.
                        this.destroyProjectileByBody(projBody as MatterJS.BodyType);
                    }
                    continue;
                }

                // ── monster-melee (swing hitbox) ↔ player ───────────────
                // Mirrors player plasma-sword: a sensor body fires briefly
                // in front of the monster; on overlap it damages the player.
                const meleeBody =
                    a.label === 'monster-melee' ? a : b.label === 'monster-melee' ? b : null;
                if (meleeBody) {
                    const other = meleeBody === a ? b : a;
                    if (other === this.playerBody) {
                        this.damagePlayerFromMelee(meleeBody as MatterJS.BodyType);
                    }
                    continue;
                }

                // ── monster (melee body) ↔ player ─────────────────────
                if (
                    (a.label === 'monster' && b === this.playerBody) ||
                    (b.label === 'monster' && a === this.playerBody)
                ) {
                    this.damagePlayerFromContact();
                    continue;
                }

                // ── monster ↔ wall (instant escape) ────────────────────
                // The 60 ms stuck detector is too slow to react to a wall
                // bounce — by the time it fires, the LERP has already
                // blended the bounce-back into the velocity vector and
                // the monster keeps oscillating against the wall. Matter
                // tells us the collision happened THIS frame, so we
                // override the velocity here: aim along the path's next
                // segment, or perpendicular to the wall normal if no
                // path is available. The wallEscapeUntil window
                // prevents the per-frame loop from undoing the
                // override before the monster clears the wall cell.
                const monsterBody =
                    a.label === 'monster' ? a : b.label === 'monster' ? b : null;
                const wallBody =
                    monsterBody && typeof a.label === 'string' && a.label.startsWith('wall:')
                        ? a
                        : monsterBody && typeof b.label === 'string' && b.label.startsWith('wall:')
                            ? b
                            : null;
                if (monsterBody && wallBody) {
                    const monster = this.monsters.find(
                        (mm) => mm.body === monsterBody && !mm.dead,
                    );
                    if (monster && this.scene.time.now >= monster.wallEscapeUntil) {
                        this.applyWallEscape(monster, wallBody);
                        // Suppress further wall escapes for 150 ms —
                        // gives the monster a chance to actually move
                        // away from the wall before re-evaluating.
                        monster.wallEscapeUntil = this.scene.time.now + 150;
                    }
                    continue;
                }
            }
        });
    }

    private destroyProjectileByBody(body: MatterJS.BodyType): void {
        const proj = this.projectiles.find((p) => p.body === body);
        if (!proj) return;
        this.destroyProjectile(proj);
    }

    /**
     * Matter collisionstart fired: the monster just bumped a wall.
     * Override its velocity along the path's next segment so it
     * actually slides past the wall instead of bouncing back into
     * it. Per-frame loop respects wallEscapeUntil so this direction
     * sticks for a few frames.
     *
     * Wall normal is the unit vector pointing FROM the wall body TO
     * the monster (Matter convention). The escape direction is the
     * tangent along the path; if the path is unavailable, we push
     * perpendicular to the wall normal as a safe default.
     */
    private applyWallEscape(monster: Monster, wallBody: MatterJS.BodyType): void {
        const mp = monster.body.position;
        const wp = wallBody.position;
        // Wall normal: from wall to monster.
        const nx = mp.x - wp.x;
        const ny = mp.y - wp.y;
        const nlen = Math.hypot(nx, ny);
        let escapeX: number;
        let escapeY: number;

        // Decide whether to slide ALONG the wall (perpendicular to
        // the normal) or aim at the next waypoint. In a tight corner
        // the next waypoint also sits against the same wall family —
        // aiming at it just drives the monster deeper into the wall.
        // isPositionInCorner reads the grid (cellSize + buffer) so the
        // detection matches the pathfinder's notion of "tight".
        const nextWp =
            monster.path && monster.currentWaypointIdx + 1 < monster.path.length
                ? monster.path[monster.currentWaypointIdx + 1]
                : null;
        const waypointAlsoInCorner = nextWp
            ? this.pathfinder?.isPositionInCorner(nextWp) ?? false
            : true;

        if (nextWp && !waypointAlsoInCorner) {
            // Open path ahead — aim at the next waypoint so the
            // monster resumes chasing along the path.
            escapeX = nextWp.x - mp.x;
            escapeY = nextWp.y - mp.y;
            const len = Math.hypot(escapeX, escapeY);
            if (len === 0) {
                escapeX = 0;
                escapeY = 0;
            } else {
                escapeX /= len;
                escapeY /= len;
            }
        } else if (nlen > 0) {
            // Cornered: slide perpendicular to the wall normal so the
            // body peels off the wall and curves around the corner.
            escapeX = -ny / nlen;
            escapeY = nx / nlen;
            // Pick the perpendicular that points away from the wall
            // (i.e. has a positive component along the wall normal).
            const dot = escapeX * (nx / nlen) + escapeY * (ny / nlen);
            if (dot < 0) {
                escapeX = -escapeX;
                escapeY = -escapeY;
            }
        } else {
            escapeX = 0;
            escapeY = 0;
        }
        const escapeSpeed = monster.spec.moveSpeed * 1.5;
        this.matter.Body.setVelocity(monster.body, {
            x: escapeX * escapeSpeed,
            y: escapeY * escapeSpeed,
        });
    }

    private damagePlayerFromProjectile(projBody: MatterJS.BodyType): void {
        const proj = this.projectiles.find((p) => p.body === projBody);
        if (!proj) return;
        const now = this.scene.time.now;
        // ponytail: contact damage respects a short cooldown so brush-by
        // contact doesn't stack to death in 1 frame. Projectiles themselves
        // always destroy on contact.
        if (now - this.lastDamageAt < COMBAT_PLAYER_DAMAGE_COOLDOWN_MS) {
            this.destroyProjectile(proj);
            return;
        }
        EventBus.emit(SFX_EVENT('player-hit'));
        this.cb.onPlayerHit(proj.damage);
        this.lastDamageAt = now;
        this.destroyProjectile(proj);
    }

    /**
     * Apply damage to the player from a monster melee swing hitbox. The body
     * self-destroys via the spawnMeleeHitbox tween (no projectile cleanup
     * needed). Like projectile hits, contact damage respects the global
     * cooldown so simultaneous melee overlaps don't double-tap.
     */
    private damagePlayerFromMelee(meleeBody: MatterJS.BodyType): void {
        const now = this.scene.time.now;
        if (now - this.lastDamageAt < COMBAT_PLAYER_DAMAGE_COOLDOWN_MS) return;
        // Find the swinging monster — the swing body was spawned from the
        // attacker's position, so pick the nearest melee monster.
        const meleeMonsters = this.monsters.filter(
            (m) => !m.dead && m.weapon.projectile === undefined,
        );
        const best = pickClosestMonster(meleeBody.position, meleeMonsters, Infinity);
        if (!best) return;
        EventBus.emit(SFX_EVENT('player-hit'));
        this.cb.onPlayerHit(best.weapon.damage);
        this.lastDamageAt = now;
    }

    private damagePlayerFromContact(): void {
        const now = this.scene.time.now;
        if (now - this.lastDamageAt < COMBAT_PLAYER_DAMAGE_COOLDOWN_MS) return;
        // Find which melee monster is overlapping the player; pick nearest.
        const meleeMonsters = this.monsters.filter(
            (m) => !m.dead && m.weapon.projectile === undefined,
        );
        const best = pickClosestMonster(this.playerBody.position, meleeMonsters, Infinity);
        if (!best) return;
        EventBus.emit(SFX_EVENT('player-hit'));
        this.cb.onPlayerHit(best.weapon.damage);
        this.lastDamageAt = now;
    }

    private destroyProjectile(proj: MonsterProjectile): void {
        const idx = this.projectiles.indexOf(proj);
        if (idx >= 0) this.projectiles.splice(idx, 1);
        this.scene.matter.world.remove(proj.body);
        proj.rect.destroy();
    }
}
