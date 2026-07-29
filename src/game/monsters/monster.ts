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

import { CAT, PROJECTILE_MONSTER_MASK, COMBAT_PLAYER_DAMAGE_COOLDOWN_MS } from '@/lib/constants';
import type { WeaponSpec } from '@/lib/weapons';
import { spawnProjectile } from '@/game/weapons/weapon';
import type { DropRef, MonsterSpec } from '@/lib/monsters';

import {
    chaseVelocity,
    decideAIState,
    dirTo,
    distBetween,
    pickClosestMonster,
} from './logic';

// ─── Entity ──────────────────────────────────────────────────────────────

export type MonsterState = 'idle' | 'chase' | 'attack' | 'dying';

export class Monster {
    readonly spec: MonsterSpec;
    readonly weapon: WeaponSpec;
    readonly body: MatterJS.BodyType;
    readonly rect: Phaser.GameObjects.Rectangle;
    readonly shadow: Phaser.GameObjects.Ellipse;
    hp: number;
    state: MonsterState = 'idle';
    lastAttackAt = 0;
    /** Set by MonsterController when killed — used to suppress further collisions. */
    dead = false;
    /** Visual tint per weapon kind — derived from weapon (ranged/melee). */
    static readonly TINT_MELEE = 0xef4444;
    static readonly TINT_RANGED = 0xa855f7;

    constructor(scene: Phaser.Scene, spec: MonsterSpec, weapon: WeaponSpec, x: number, y: number) {
        this.spec = spec;
        this.weapon = weapon;
        this.hp = spec.hp;

        const w = spec.body.halfW * 2;
        const h = spec.body.halfH * 2;

        this.body = scene.matter.add.rectangle(x, y, w, h, {
            label: 'monster',
            collisionFilter: {
                category: CAT.MONSTER_MELEE,
                // +BULLET so player bullets trigger collisionstart — the
                // symmetric mask check fails otherwise and monsters never
                // take damage. Walls stay in the mask so monsters still bump.
                mask: CAT.CHARACTER | CAT.BULLET | (CAT.WALL_TALL | CAT.WALL_SHORT),
            },
        });

        const matter = (Phaser as any).Physics.Matter.Matter;
        matter.Body.setInertia(this.body, Infinity);

        const tint = weapon.projectile !== undefined
            ? Monster.TINT_RANGED
            : Monster.TINT_MELEE;
        
        // Foot shadow based on hit box size
        this.shadow = scene.add.ellipse(x, y, w, h * 0.4, 0x000000, 0.3);

        this.rect = scene.add.rectangle(x, y, w, h, tint, 0.85);
        this.rect.setStrokeStyle(2, 0x111827, 1);
    }

    position(): { x: number; y: number } {
        return this.body.position;
    }

    destroy(scene: Phaser.Scene): void {
        scene.matter.world.remove(this.body);
        this.rect.destroy();
        this.shadow.destroy();
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
    /** Last attack timestamp per monster — independently tracked to avoid
     *  interleaved races when two monsters fire on the same frame. */
    private lastDamageAt = 0;

    constructor(
        scene: Phaser.Scene,
        spawns: { spec: MonsterSpec; weapon: WeaponSpec; x: number; y: number }[] | undefined,
        playerBody: MatterJS.BodyType,
        cb: MonsterControllerCallbacks,
    ) {
        this.scene = scene;
        this.playerBody = playerBody;
        this.cb = cb;
        this.matter = (Phaser as any).Physics.Matter.Matter;

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
        for (let i = this.monsters.length - 1; i >= 0; i--) {
            const m = this.monsters[i];
            if (m.dead) {
                this.monsters.splice(i, 1);
                continue;
            }
            const mp = m.body.position;
            const dist = distBetween(mp, this.playerBody.position);
            const dirToPlayer = dirTo(mp, this.playerBody.position);

            // ── AI transitions ─────────────────────────────────────────
            m.state = decideAIState(dist, m.weapon.range);

            // ── Velocity ──────────────────────────────────────────────
            let vx = 0;
            let vy = 0;
            if (m.state === 'chase') {
                const cv = chaseVelocity(dirToPlayer, m.spec.moveSpeed);
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

            // ── Visual sync ───────────────────────────────────────────
            const footY = Math.round(mp.y);
            m.rect.setPosition(mp.x, mp.y);
            m.rect.setDepth(footY);
            m.shadow.setPosition(mp.x, mp.y);
            m.shadow.setDepth(footY - 1);
            if (dist > 1) {
                m.rect.setRotation(Math.atan2(dirToPlayer.y, dirToPlayer.x));
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
    applyBulletDamage(bulletDamage: number, bulletBody: MatterJS.BodyType): void {
        const bp = bulletBody.position;
        const target = pickClosestMonster(bp, this.monsters, 64);
        if (target) {
            target.hp -= bulletDamage;
            if (target.hp <= 0) {
                this.kill(target);
            }
        }
    }

    setDebugVisible(visible: boolean): void {
        for (const m of this.monsters) {
            m.rect.setVisible(visible);
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
        m.destroy(this.scene);
        this.cb.onMonsterDied(m);
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