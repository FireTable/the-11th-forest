/**
 * src/game/characters/load-character.ts
 * --------------------------------------------------------------------------
 * Temporary test character — a Matter rectangle with WASD movement.
 *
 * Purpose: let the level designer walk into the air walls and verify
 * the physics bodies match the editor polygons. NOT gameplay code; the
 * real character will replace this when it's built.
 *
 * ponytail: replace with the proper character module when one lands;
 * delete this file at the same time.
 */

import * as Phaser from 'phaser';

import { CAT } from '@/lib/constants';
import type { Level } from '@/lib/levels/types';

const SPEED = 10; // px / sec — top-down walking speed
const HALF_W = 16; // body half-width
const HALF_H = 24; // body half-height

/**
 * Spawn a green rectangle character at (x, y) with WASD movement.
 * The visual rectangle follows the body's position every frame.
 *
 * Returns the body + rectangle so callers (e.g. future gameplay code)
 * can introspect or remove them. The update listener stays attached
 * to the scene for the scene's lifetime — single-scene game, no
 * cleanup needed.
 */
export function loadCharacter(
    scene: Phaser.Scene,
    level: Level,
    x: number,
    y: number,
): { body: MatterJS.BodyType; rect: Phaser.GameObjects.Rectangle } {
    const body = scene.matter.add.rectangle(x, y, 32, 48, {
        label: 'character',
        // Friction & restitution left default; top-down control beats
        // physics response for arcade movement.
        collisionFilter: {
            category: CAT.CHARACTER,
            // Mask all categories for now — walls (only walls, until
            // BULLET exists) will collide with this body.
            mask: 0xffff,
        },
    });

    const rect = scene.add.rectangle(x, y, 32, 48, 0x22c55e, 0.85);
    rect.setStrokeStyle(2, 0x052e16, 1);

    const kb = scene.input.keyboard!;
    const wKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    const aKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    const sKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    const dKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.D);

    scene.events.on('update', () => {
        let vx = 0;
        let vy = 0;
        if (wKey.isDown) vy -= 1;
        if (sKey.isDown) vy += 1;
        if (aKey.isDown) vx -= 1;
        if (dKey.isDown) vx += 1;
        const len = Math.hypot(vx, vy);
        // Phaser 4's .d.ts doesn't expose the bundled Matter lib, so we
        // can't type Matter.Body.setVelocity() — but it lives at runtime
        // as Phaser.Physics.Matter.Matter. Use it instead of writing
        // body.velocity directly: that doesn't wake sleeping bodies,
        // which is why WASD looked unresponsive after a moment of idle.
        const matter = (Phaser as any).Physics.Matter.Matter;
        if (len > 0) {
            matter.Body.setVelocity(body, {
                x: (vx / len) * SPEED,
                y: (vy / len) * SPEED,
            });
        } else {
            matter.Body.setVelocity(body, { x: 0, y: 0 });
        }
        // Hard clamp inside the level bounds — the world setBounds walls
        // are the primary containment, but a fast body can still slip
        // through a corner. This is the safety net.
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
        rect.setPosition(body.position.x, body.position.y);
        rect.setRotation(body.angle);
    });

    return { body, rect };
}