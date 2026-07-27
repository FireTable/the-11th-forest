/**
 * src/game/characters/load-character.ts
 * --------------------------------------------------------------------------
 * Temporary test character — Matter rectangle + WASD movement +
 * hold-mouse-button-to-fire bullets. Used to walk into air walls
 * and to verify short walls don't block bullets.
 *
 * Bullets: small Matter circle for collision (4px, fits between
 * triangle seams), 16×4 yellow rectangle for the visual streak
 * (rotated to match velocity each frame). They die on contact
 * with any wall, including short ones.
 *
 * ponytail: replace with the proper character module + weapon
 * system when those land; delete this file at the same time.
 * Until then, the bullet firing lives here as a throwaway test.
 */

import * as Phaser from 'phaser';

import { CAT } from '@/lib/constants';
import type { Level } from '@/lib/levels/types';

const SPEED = 10; // px / sec — top-down walking speed
const HALF_W = 16; // body half-width
const HALF_H = 24; // body half-height

const BULLET_BODY_RADIUS = 4; // small for collision (fits triangle seams)
const BULLET_STREAK_W = 16; // visual streak length
const BULLET_STREAK_H = 8; // visual streak thickness
const BULLET_SPEED = 20; // px / sec
const FIRE_INTERVAL_MS = 80; // ms between bullets when holding mouse
const TRAIL_LENGTH = 6; // # of position samples per bullet's trail

interface Bullet {
    body: MatterJS.BodyType;
    rect: Phaser.GameObjects.Rectangle;
    trail: { x: number; y: number }[];
}

/**
 * Spawn a green rectangle character at (x, y) with WASD movement +
 * hold-mouse-button-to-fire bullets aimed at the cursor.
 */
export function loadCharacter(
    scene: Phaser.Scene,
    level: Level,
    x: number,
    y: number,
): { body: MatterJS.BodyType; rect: Phaser.GameObjects.Rectangle } {
    const body = scene.matter.add.rectangle(x, y, 32, 48, {
        label: 'character',
        collisionFilter: {
            category: CAT.CHARACTER,
            // Mask all EXCEPT bullets — the character fires them from
            // inside its own body, so they must not self-collide.
            mask: 0xffff & ~CAT.BULLET,
        },
    });

    const rect = scene.add.rectangle(x, y, 32, 48, 0x22c55e, 0.85);
    rect.setStrokeStyle(2, 0x052e16, 1);

    const kb = scene.input.keyboard!;
    const wKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    const aKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    const sKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    const dKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.D);

    const bullets: Bullet[] = [];
    const matter = (Phaser as any).Physics.Matter.Matter;
    const trailGraphics = scene.add.graphics();
    trailGraphics.setDepth(-1); // behind bullet streaks, above background

    let firing = false;
    let targetX = 0;
    let targetY = 0;
    let lastFire = 0;

    function destroyBullet(idx: number) {
        const b = bullets[idx];
        b.rect.destroy();
        scene.matter.world.remove(b.body);
        bullets.splice(idx, 1);
    }

    function fireBullet(tx: number, ty: number) {
        const origin = body.position;
        const dx = tx - origin.x;
        const dy = ty - origin.y;
        const len = Math.hypot(dx, dy);
        if (len === 0) return;

        const angle = Math.atan2(dy, dx);

        const bulletBody = scene.matter.add.circle(origin.x, origin.y, BULLET_BODY_RADIUS, {
            label: 'bullet',
            collisionFilter: {
                category: CAT.BULLET,
                mask: 0xffff,
            },
        });
        matter.Body.setVelocity(bulletBody, {
            x: (dx / len) * BULLET_SPEED,
            y: (dy / len) * BULLET_SPEED,
        });

        const bulletRect = scene.add.rectangle(origin.x, origin.y, BULLET_STREAK_W, BULLET_STREAK_H, 0x22c55e);
        bulletRect.setStrokeStyle(1, 0x14532d, 1);
        bulletRect.setRotation(angle);

        bullets.push({
            body: bulletBody,
            rect: bulletRect,
            trail: [{ x: origin.x, y: origin.y }],
        });
    }

    // Bullets die on contact with any wall. Matter's collisionstart
    // event has {pairs: [...]} where each pair has bodyA/bodyB.
    scene.matter.world.on('collisionstart', (event: any) => {
        const pairs = event.pairs || [];
        for (const pair of pairs) {
            const bulletBody =
                pair.bodyA.label === 'bullet'
                    ? pair.bodyA
                    : pair.bodyB.label === 'bullet'
                        ? pair.bodyB
                        : null;
            if (!bulletBody) continue;
            for (let i = bullets.length - 1; i >= 0; i--) {
                if (bullets[i].body === bulletBody) {
                    destroyBullet(i);
                    break;
                }
            }
        }
    });

    // Bind directly on the Phaser canvas DOM rather than through
    // scene.input — Phaser 4 only emits scene-level pointerdown when
    // the click target is the canvas AND there's no interactive game
    // object under the cursor; easy to miss in this scene.
    // ponytail: replace with Phaser-native binding once the real
    // character module is wired up.
    const canvas = (scene as any).game.canvas as HTMLCanvasElement | undefined;
    if (canvas) {
        const updateTarget = (e: PointerEvent) => {
            const rect = canvas.getBoundingClientRect();
            const camera = scene.cameras.main;
            targetX = camera.scrollX + (e.clientX - rect.left) * (camera.width / rect.width);
            targetY = camera.scrollY + (e.clientY - rect.top) * (camera.height / rect.height);
        };
        canvas.addEventListener('pointerdown', (e) => {
            updateTarget(e);
            firing = true;
            lastFire = 0;
        });
        canvas.addEventListener('pointermove', (e) => {
            if (firing) updateTarget(e);
        });
        const stop = () => {
            firing = false;
        };
        canvas.addEventListener('pointerup', stop);
        canvas.addEventListener('pointerleave', stop);
    }

    scene.events.on('update', () => {
        let vx = 0;
        let vy = 0;
        if (wKey.isDown) vy -= 1;
        if (sKey.isDown) vy += 1;
        if (aKey.isDown) vx -= 1;
        if (dKey.isDown) vx += 1;
        const len = Math.hypot(vx, vy);
        if (len > 0) {
            matter.Body.setVelocity(body, {
                x: (vx / len) * SPEED,
                y: (vy / len) * SPEED,
            });
        } else {
            matter.Body.setVelocity(body, { x: 0, y: 0 });
        }
        const maxX = level.imageSize.width - HALF_W;
        const maxY = level.imageSize.height - HALF_H;
        const pos = body.position;
        if (pos.x < HALF_W || pos.x > maxX || pos.y < HALF_H || pos.y > maxY) {
            matter.Body.setPosition(body, {
                x: Math.max(HALF_W, Math.min(maxX, pos.x)),
                y: Math.max(HALF_H, Math.min(maxY, pos.y)),
            });
            matter.Body.setVelocity(body, { x: 0, y: 0 });
        }
        rect.setPosition(pos.x, pos.y);
        rect.setRotation(body.angle);

        // Hold-fire: spawn on a fixed cadence while firing.
        const now = scene.time.now;
        if (firing && now - lastFire >= FIRE_INTERVAL_MS) {
            fireBullet(targetX, targetY);
            lastFire = now;
        }

        // Sync bullets + record trail.
        trailGraphics.clear();
        for (let i = bullets.length - 1; i >= 0; i--) {
            const b = bullets[i];
            const bp = b.body.position;
            // Rotate the streak to match velocity.
            const vel = b.body.velocity;
            const angle = Math.atan2(vel.y, vel.x);
            b.rect.setPosition(bp.x, bp.y);
            b.rect.setRotation(angle);

            const trail = b.trail;
            trail.push({ x: bp.x, y: bp.y });
            if (trail.length > TRAIL_LENGTH) trail.shift();

            if (trail.length >= 2) {
                for (let k = 1; k < trail.length; k++) {
                    const alpha = k / (trail.length - 1);
                    trailGraphics.lineStyle(3, 0x22c55e, alpha * 0.7);
                    trailGraphics.beginPath();
                    trailGraphics.moveTo(trail[k - 1].x, trail[k - 1].y);
                    trailGraphics.lineTo(trail[k].x, trail[k].y);
                    trailGraphics.strokePath();
                }
            }

            // Bullets only die via collisionstart (wall hit). No
            // timeout — if one ever leaks past every collider, that's
            // a bug to find, not paper over.
        }
    });

    return { body, rect };
}