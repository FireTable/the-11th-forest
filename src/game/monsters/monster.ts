/**
 * src/game/monsters/monster.ts
 * --------------------------------------------------------------------------
 * Monsters module — entity + controller + projectile + drop roller in one
 * file. Pure helpers (distBetween / dirTo / decideAIState / chaseVelocity
 * / pickClosestMonster) live in `./logic.ts`.
 *
 *   - Monster: one monster entity (body + visual + HP + AI state).
 *   - MonsterController: scene-side orchestrator. Self-spawns monsters
 *     from spawn array, runs per-frame AI tick, fires projectiles, and
 *     resolves monster → player damage via collisionstart.
 *   - fireMonsterProjectile: ranged-monster projectile factory.
 *   - rollDrops: monster death drop table roller (independent Bernoulli).
 */

import * as Phaser from 'phaser';

import { MONSTER_PROJECTILE_MASK } from '@/game/weapons/logic';
import { CAT } from '@/lib/constants';
import type { DropRef } from '@/lib/monsters';
import type { MonsterSpec } from '@/lib/monsters';
import type { MonsterSpawn } from '@/lib/levels/types';
import type { DropSpec } from '@/lib/drops';

import {
    chaseVelocity,
    decideAIState,
    dirTo,
    distBetween,
    pickClosestMonster,
} from './logic';

const ATTACK_COOLDOWN_MS = 100; // minimum gap between consecutive attacks
const PROJECTILE_RADIUS = 4;

// ─── Entity ──────────────────────────────────────────────────────────────

export type MonsterKind = 'melee' | 'ranged';

export type MonsterState = 'idle' | 'chase' | 'attack' | 'dying';

export class Monster {
    readonly spec: MonsterSpec;
    readonly body: MatterJS.BodyType;
    readonly rect: Phaser.GameObjects.Rectangle;
    hp: number;
    state: MonsterState = 'idle';
    lastAttackAt = 0;
    /** Set by MonsterController when killed — used to suppress further collisions. */
    dead = false;
    /** Visual tint per kind. */
    static readonly TINT_MELEE = 0xef4444;
    static readonly TINT_RANGED = 0xa855f7;

    constructor(scene: Phaser.Scene, spec: MonsterSpec, x: number, y: number) {
        this.spec = spec;
        this.hp = spec.hp;

        const w = spec.kind === 'melee' ? 28 : 24;
        const h = spec.kind === 'melee' ? 28 : 24;

        this.body = scene.matter.add.rectangle(x, y, w, h, {
            label: 'monster',
            collisionFilter: {
                category: CAT.MONSTER_MELEE,
                // +BULLET so player bullets trigger collisionstart — the
                // symmetric mask check fails otherwise and monsters never
                // take damage. Walls stay in the mask so monsters still bump.
                mask: CAT.CHARACTER | CAT.BULLET | CAT.WALL_PLAYER_MASK,
            },
        });

        const tint =
            spec.kind === 'melee' ? Monster.TINT_MELEE : Monster.TINT_RANGED;
        this.rect = scene.add.rectangle(x, y, w, h, tint, 0.85);
        this.rect.setStrokeStyle(2, 0x111827, 1);
    }

    position(): { x: number; y: number } {
        return this.body.position;
    }

    destroy(scene: Phaser.Scene): void {
        scene.matter.world.remove(this.body);
        this.rect.destroy();
        this.dead = true;
    }
}

// ─── Projectile factory ──────────────────────────────────────────────────

export interface MonsterProjectile {
    body: MatterJS.BodyType;
    rect: Phaser.GameObjects.Rectangle;
    damage: number;
}

export function fireMonsterProjectile(
    scene: Phaser.Scene,
    originX: number,
    originY: number,
    dx: number,
    dy: number,
    speed: number,
    damage: number,
): MonsterProjectile {
    const matter = (Phaser as any).Physics.Matter.Matter;
    const len = Math.hypot(dx, dy);
    if (len === 0) throw new Error('fireMonsterProjectile: zero-length direction');
    const body = scene.matter.add.circle(originX, originY, PROJECTILE_RADIUS, {
        label: 'monster-projectile',
        collisionFilter: {
            category: CAT.MONSTER_PROJECTILE,
            // Mask comes from weapons/logic — same wall semantics as player
            // bullets: tall walls block, short walls don't.
            mask: MONSTER_PROJECTILE_MASK,
        },
    });

    matter.Body.setVelocity(body, {
        x: (dx / len) * speed,
        y: (dy / len) * speed,
    });

    const angle = Math.atan2(dy, dx);
    const rect = scene.add.rectangle(originX, originY, 14, 4, 0xef4444);
    rect.setStrokeStyle(1, 0x7f1d1d, 1);
    rect.setRotation(angle);

    return { body, rect, damage };
}

// ─── Drop roller ─────────────────────────────────────────────────────────

export interface RolledDrop {
    dropId: string;
    spec: DropSpec;
}

/** Roll each entry independently; return all that succeed. */
export function rollDrops(table: DropRef[], byId: (id: string) => DropSpec): RolledDrop[] {
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
        spawns: MonsterSpawn[] | undefined,
        playerBody: MatterJS.BodyType,
        getMonster: (id: string) => MonsterSpec,
        cb: MonsterControllerCallbacks,
    ) {
        this.scene = scene;
        this.playerBody = playerBody;
        this.cb = cb;
        this.matter = (Phaser as any).Physics.Matter.Matter;

        // Self-spawn monsters from the level spawn array.
        if (spawns) {
            for (const s of spawns) {
                this.monsters.push(new Monster(scene, getMonster(s.type), s.x, s.y));
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
            m.state = decideAIState(dist, m.spec.attackRange);

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
                time - m.lastAttackAt >= m.spec.attackIntervalMs
            ) {
                this.performAttack(m, dirToPlayer.x, dirToPlayer.y);
                m.lastAttackAt = time;
            }

            // ── Visual sync ───────────────────────────────────────────
            m.rect.setPosition(mp.x, mp.y);
            if (dist > 1) {
                m.rect.setRotation(Math.atan2(dirToPlayer.y, dirToPlayer.x));
            }
        }

        // ── Projectile visual sync ────────────────────────────────────
        for (const proj of this.projectiles) {
            const bp = proj.body.position;
            const vel = proj.body.velocity;
            proj.rect.setPosition(bp.x, bp.y);
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

    destroy(): void {
        for (const m of this.monsters) m.destroy(this.scene);
        for (const p of this.projectiles) {
            this.scene.matter.world.remove(p.body);
            p.rect.destroy();
        }
        this.monsters.length = 0;
        this.projectiles.length = 0;
    }

    // ─── internal helpers ─────────────────────────────────────────────────

    private performAttack(m: Monster, dx: number, dy: number): void {
        if (m.spec.kind === 'melee') {
            // Melee: contact damage goes through collisionstart in
            // bindCollisions below — no projectile here.
            return;
        }
        const mp = m.body.position;
        const len = Math.hypot(dx, dy);
        if (len === 0) return;
        const proj = fireMonsterProjectile(
            this.scene,
            mp.x,
            mp.y,
            dx,
            dy,
            m.spec.projectile!.speed,
            m.spec.projectile!.damage,
        );
        this.projectiles.push(proj);
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
        if (now - this.lastDamageAt < ATTACK_COOLDOWN_MS) {
            this.destroyProjectile(proj);
            return;
        }
        this.cb.onPlayerHit(proj.damage);
        this.lastDamageAt = now;
        this.destroyProjectile(proj);
    }

    private damagePlayerFromContact(): void {
        const now = this.scene.time.now;
        if (now - this.lastDamageAt < ATTACK_COOLDOWN_MS) return;
        // Find which melee monster is overlapping the player; pick nearest.
        const meleeMonsters = this.monsters.filter((m) => !m.dead && m.spec.kind === 'melee');
        const best = pickClosestMonster(this.playerBody.position, meleeMonsters, Infinity);
        if (!best) return;
        this.cb.onPlayerHit(best.spec.contactDamage ?? 0);
        this.lastDamageAt = now;
    }

    private destroyProjectile(proj: MonsterProjectile): void {
        const idx = this.projectiles.indexOf(proj);
        if (idx >= 0) this.projectiles.splice(idx, 1);
        this.scene.matter.world.remove(proj.body);
        proj.rect.destroy();
    }
}