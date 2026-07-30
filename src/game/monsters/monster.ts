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

import { CAT, PROJECTILE_MONSTER_MASK, COMBAT_PLAYER_DAMAGE_COOLDOWN_MS, SFX_EVENT } from '@/lib/constants';
import { EventBus } from '@/lib/events/bus';
import type { WeaponSpec } from '@/lib/weapons';
import { spawnProjectile } from '@/game/weapons/weapon';
import type { DropRef, MonsterSpec } from '@/lib/monsters';

import {
    chaseVelocity,
    decideAIState,
    dirTo,
    distBetween,
    pickClosestMonster,
    PathfindingService,
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
    hp: number;
    state: MonsterState = 'idle';
    lastAttackAt = 0;
    lastHitAt = 0;
    /** Set by MonsterController when killed — used to suppress further collisions. */
    dead = false;
    /** One-shot guard so the aggro growl only fires once per monster. */
    hasAggroed = false;
    /** Waypoints for pathfinding navigation. */
    path: { x: number; y: number }[] | null = null;
    currentWaypointIdx = 0;
    /** Visual tint per weapon kind — derived from weapon (ranged/melee). */
    static readonly TINT_MELEE = 0xef4444;
    static readonly TINT_RANGED = 0xa855f7;

    constructor(scene: Phaser.Scene, spec: MonsterSpec, weapon: WeaponSpec, x: number, y: number) {
        this.spec = spec;
        this.weapon = weapon;
        this.hp = spec.hp;

        // Determine physical dimensions
        let w = spec.body.halfW * 2;
        let h = spec.body.halfH * 2;
        let centerY = y;

        if (spec.sprite) {
            // Get sprite dimensions dynamically
            const cellW = 64; // Default scale 1.0 cell size
            const cellH = 64;
            const scale = spec.sprite.scale ?? 1.0;
            w = cellW * scale * 0.8; // 80% width for clean collisions
            h = cellH * scale; // Full height for sprite body
            centerY = y - h / 2 + spec.body.halfH;
        }

        this.body = scene.matter.add.rectangle(x, centerY, w, h, {
            label: 'monster',
            collisionFilter: {
                category: CAT.MONSTER_MELEE,
                mask: CAT.CHARACTER | CAT.BULLET | (CAT.WALL_TALL | CAT.WALL_SHORT),
            },
        });

        const matter = (Phaser as any).Physics.Matter.Matter;
        matter.Body.setInertia(this.body, Infinity);

        const tint = weapon.projectile !== undefined
            ? Monster.TINT_RANGED
            : Monster.TINT_MELEE;
        
        // Foot shadow based on hit box size
        this.shadow = scene.add.ellipse(x, y, spec.body.halfW * 2, spec.body.halfH * 0.8, 0x000000, 0.3);

        // Feet Body Debug Rect (Green outline)
        this.debugBodyRect = scene.add.rectangle(x, y, spec.body.halfW * 2, spec.body.halfH * 2);
        this.debugBodyRect.setStrokeStyle(2, 0x22c55e, 1);
        this.debugBodyRect.setDepth(9999);
        this.debugBodyRect.setVisible(false);

        // Full Hitbox Debug Rect (Purple / Red outline matching full Body)
        this.debugHitboxRect = scene.add.rectangle(x, centerY, w, h, tint, 0.25);
        this.debugHitboxRect.setStrokeStyle(2, tint, 1);
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

    destroy(scene: Phaser.Scene): void {
        scene.matter.world.remove(this.body);
        this.debugBodyRect?.destroy();
        this.debugHitboxRect?.destroy();
        this.sprite?.destroy();
        this.shadow?.destroy();
        this.dead = true;
    }
}

// ─── Drop roller ─────────────────────────────────────────────────────────

export interface RolledDrop {
    dropId: string;
    spec: unknown; // DropSpec — resolved at the call site
}

/** Roll each entry independently; return all that succeed. */
export function rollDrops(
    table: DropRef[],
    byId: (id: string) => unknown,
): RolledDrop[] {
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
    rect: Phaser.GameObjects.Rectangle;
    damage: number;
    monster: Monster;
}

export class MonsterController {
    private readonly scene: Phaser.Scene;
    private readonly monsters: Monster[] = [];
    private readonly projectiles: MonsterProjectile[] = [];
    private readonly cb: MonsterControllerCallbacks;
    /** Cached for fast lookup in attack tests. */
    private readonly playerBody: MatterJS.BodyType;
    private readonly matter: any;
    private readonly pathfinder?: PathfindingService;
    private lastPathCalcAt = 0;
    private lastPlayerPos = { x: 0, y: 0 };
    /** Last attack timestamp per monster — independently tracked to avoid
     *  interleaved races when two monsters fire on the same frame. */
    private lastDamageAt = 0;

    constructor(
        scene: Phaser.Scene,
        spawns: { spec: MonsterSpec; weapon: WeaponSpec; x: number; y: number }[] | undefined,
        playerBody: MatterJS.BodyType,
        cb: MonsterControllerCallbacks,
        pathfinder?: PathfindingService,
    ) {
        this.scene = scene;
        this.playerBody = playerBody;
        this.cb = cb;
        this.matter = (Phaser as any).Physics.Matter.Matter;
        this.pathfinder = pathfinder;

        // Self-spawn monsters from the spawn list (replaces the old
        // spawnMonsters helper — controller owns its own construction).
        if (spawns) {
            for (const s of spawns) {
                this.monsters.push(new Monster(scene, s.spec, s.weapon, s.x, s.y));
            }
        }

        this.bindCollisions();
    }

    /** Per-frame: AI tick + projectile sync + cleanup. */
    update(time: number): void {
        const pp = this.playerBody.position;
        const playerMovedDist = distBetween(this.lastPlayerPos, pp);
        const shouldRecalcPaths =
            this.pathfinder &&
            (playerMovedDist > 32 || time - this.lastPathCalcAt > 600);

        if (shouldRecalcPaths) {
            this.lastPathCalcAt = time;
            this.lastPlayerPos = { x: pp.x, y: pp.y };
        }

        for (let i = this.monsters.length - 1; i >= 0; i--) {
            const m = this.monsters[i];
            if (m.dead) {
                this.monsters.splice(i, 1);
                continue;
            }
            const mp = m.body.position;
            const dist = distBetween(mp, pp);
            const dirToPlayer = dirTo(mp, pp);

            // Recalculate A* path if needed
            if (shouldRecalcPaths && dist > m.weapon.range && this.pathfinder) {
                const path = this.pathfinder.findPath(mp, pp);
                if (path && path.length > 1) {
                    m.path = path;
                    m.currentWaypointIdx = 1; // 0 is start cell
                } else {
                    m.path = null;
                }
            }

            if (m.state === 'dying') {
                // Freeze physics body during death animation
                this.matter.Body.setVelocity(m.body, { x: 0, y: 0 });
                continue;
            }

            // ── AI transitions ─────────────────────────────────────────
            const prevState = m.state;
            m.state = decideAIState(dist, m.weapon.range);
            // One-shot aggro growl on the first idle → chase transition.
            if (!m.hasAggroed && prevState === 'idle' && m.state === 'chase') {
                m.hasAggroed = true;
                EventBus.emit(SFX_EVENT(m.spec.sfx?.aggro ?? 'monster-aggro'));
            }

            // ── Velocity ──────────────────────────────────────────────
            let vx = 0;
            let vy = 0;
            if (m.state === 'chase') {
                let targetDir = dirToPlayer;
                // Follow Waypoints if available
                if (m.path && m.currentWaypointIdx < m.path.length) {
                    const targetWp = m.path[m.currentWaypointIdx];
                    const distToWp = distBetween(mp, targetWp);
                    if (distToWp < 16) {
                        m.currentWaypointIdx++;
                    }
                    if (m.currentWaypointIdx < m.path.length) {
                        targetDir = dirTo(mp, m.path[m.currentWaypointIdx]);
                    }
                }
                const cv = chaseVelocity(targetDir, m.spec.moveSpeed);
                vx = cv.vx;
                vy = cv.vy;
            }
            this.matter.Body.setVelocity(m.body, { x: vx, y: vy });

            // ── Attack tick ──────────────────────────────────────────
            if (
                m.state === 'attack' &&
                time - m.lastAttackAt >= m.weapon.cooldownMs
            ) {
                this.performAttack(m, dirToPlayer);
                m.lastAttackAt = time;
            }

            // ── Visual sync & animation ───────────────────────────────
            const footY = Math.round(mp.y + (m.sprite ? m.sprite.displayHeight / 2 - m.spec.body.halfH : 0));
            const footX = mp.x;
            
            // Align feet shadow and green debug rect with actual feet position
            m.shadow.setPosition(footX, footY);
            m.shadow.setDepth(footY - 1);
            m.debugBodyRect.setPosition(footX, footY - m.spec.body.halfH);

            if (m.sprite) {
                // Calculate visual offset. `left` shifts right (+) / left (-), `bottom` shifts up (-) / down (+)
                const rawX = m.spec.sprite?.offset?.left ?? m.spec.sprite?.offset?.x ?? 0;
                const rawY = m.spec.sprite?.offset?.bottom !== undefined 
                    ? -m.spec.sprite.offset.bottom 
                    : (m.spec.sprite?.offset?.y ?? 0);
                const offX = rawX * (m.sprite.flipX ? -1 : 1);
                const offY = rawY;

                // Align sprite with feet and apply offset
                m.sprite.setPosition(mp.x + offX, mp.y + offY);
                m.sprite.setDepth(footY);

                // Align Editor debug rect with physics body center
                m.debugHitboxRect.setPosition(mp.x, mp.y);

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
                if (dist > 1) {
                    m.debugHitboxRect.setRotation(Math.atan2(dirToPlayer.y, dirToPlayer.x));
                }
            }
        }

        // ── Projectile visual sync ────────────────────────────────────
        for (const proj of this.projectiles) {
            const bp = proj.body.position;
            const vel = proj.body.velocity;
            proj.rect.setPosition(bp.x, bp.y);
            proj.rect.setDepth(Math.round(bp.y));
            proj.rect.setRotation(Math.atan2(vel.y, vel.x));
        }
    }

    /** Apply damage from a player bullet to a specific monster (or AoE later). */
    applyBulletDamage(bulletDamage: number, hitBody: MatterJS.BodyType): void {
        // Find monster whose main body or compound parts match hitBody
        const target = this.monsters.find((m) => {
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
            target.hp -= bulletDamage;
            target.lastHitAt = this.scene.time.now;
            EventBus.emit(SFX_EVENT(target.spec.sfx?.hit ?? 'monster-hit'));

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

    private performAttack(m: Monster, dirToPlayer: { x: number; y: number }): void {
        const weapon = m.weapon;
        // Melee: contact damage via collisionstart (handled in bindCollisions).
        // No projectile to spawn — just return.
        if (weapon.projectile === undefined) return;

        // Ranged: fire a projectile from the monster center toward the
        // player's CURRENT position. Don't lead — player dodge makes that
        // less rewarding than reaction aim.
        const len = Math.hypot(dirToPlayer.x, dirToPlayer.y);
        if (len === 0) return;
        const { speed, visual: size } = weapon.projectile;
        EventBus.emit(SFX_EVENT('monster-shoot'));
        const bullet = spawnProjectile(
            this.scene,
            this.matter,
            { x: m.body.position.x, y: m.body.position.y },
            { x: dirToPlayer.x, y: dirToPlayer.y },
            {
                label: 'monster-projectile',
                category: CAT.MONSTER_PROJECTILE,
                mask: PROJECTILE_MONSTER_MASK,
                speed,
                damage: weapon.damage,
                size,
            },
        );
        this.projectiles.push({ ...bullet, monster: m });
    }

    private kill(m: Monster): void {
        m.state = 'dying';
        EventBus.emit(SFX_EVENT(m.spec.sfx?.death ?? 'monster-death'));

        // Disable collision filter so dead monster doesn't block player or bullets
        m.body.collisionFilter.mask = 0;

        const deathTrackKey = animKey(m.spec, 'death');
        if (m.sprite && this.scene.anims.exists(deathTrackKey)) {
            m.sprite.play(deathTrackKey);
            m.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
                m.destroy(this.scene);
                this.cb.onMonsterDied(m);
            });
        } else {
            // Fallback if no sprite / death anim
            m.destroy(this.scene);
            this.cb.onMonsterDied(m);
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

                // ── monster (melee body) ↔ player ─────────────────────
                if (
                    (a.label === 'monster' && b === this.playerBody) ||
                    (b.label === 'monster' && a === this.playerBody)
                ) {
                    this.damagePlayerFromContact();
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