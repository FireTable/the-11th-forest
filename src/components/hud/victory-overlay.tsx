/**
 * src/components/hud/victory-overlay.tsx
 * --------------------------------------------------------------------------
 * Full-screen Lottie confetti that plays on top of the scene when
 * `useGameStore().isVictory` flips true. Intentionally NON-modal:
 *
 *   - `pointer-events-none` so the player can still walk + interact
 *     with the level (specifically the teleporter that returns them
 *     to the tavern)
 *   - no dialog box, button, or "Return to Tavern" UI — the user
 *     exits via the in-scene teleporter instead
 *
 * The animation data is generated at module load (see `makeConfetti`)
 * — kept inline so designers can tweak the constants without an extra
 * asset round-trip. 24 particles fall from above the viewport with
 * rotation + fade, looping indefinitely while the victory state is
 * held.
 */

import Lottie from 'lottie-react';

import { useGameStore } from '@/store/game-store';

const COLORS: Array<[number, number, number]> = [
    [0.98, 0.75, 0.14], // amber
    [0.96, 0.62, 0.04], // amber-deep
    [0.2, 0.83, 0.6], // emerald
    [0.38, 0.65, 0.98], // sky
    [0.96, 0.45, 0.71], // pink
    [0.65, 0.55, 0.98], // violet
];

const FR = 30;
const TOTAL = 150;
const PARTICLES = 24;
const VIEW_W = 1920;
const VIEW_H = 1080;

/**
 * Build the Lottie animation JSON for a single particle layer.
 * Position drops from y = -40 to y = VIEW_H + 40 with horizontal drift,
 * rotation spins 0 -> 540°, opacity fades 100 -> 0 at the tail.
 */
function makeParticleLayer(index: number): Record<string, unknown> {
    const color = COLORS[index % COLORS.length];
    const startX = (index * 73 + 41) % VIEW_W;
    const endX = startX + ((index % 2 === 0 ? 1 : -1) * (60 + (index % 4) * 30));
    const startFrame = (index * 4) % 20;
    const endFrame = startFrame + 110;

    return {
        ddd: 0,
        ind: index + 1,
        ty: 4,
        nm: `p${index}`,
        sr: 1,
        ks: {
            o: {
                a: 1,
                k: [
                    { t: startFrame, s: [100] },
                    { t: endFrame - 15, s: [100] },
                    { t: endFrame, s: [0] },
                ],
            },
            r: {
                a: 1,
                k: [
                    { t: startFrame, s: [0] },
                    { t: endFrame, s: [540 * ((index % 2 === 0 ? 1 : -1))] },
                ],
            },
            p: {
                a: 1,
                k: [
                    { t: startFrame, s: [startX, -40] },
                    { t: endFrame, s: [endX, VIEW_H + 40] },
                ],
            },
            a: { a: 0, k: [0, 0] },
            s: { a: 0, k: [100, 100] },
        },
        ao: 0,
        shapes: [
            {
                ty: 'rc',
                d: 1,
                s: { a: 0, k: [index % 2 === 0 ? 10 : 8, index % 3 === 0 ? 14 : 10] },
                p: { a: 0, k: [0, 0] },
                r: { a: 0, k: 1 },
                nm: 'r',
                c: { a: 0, k: [color[0], color[1], color[2], 1] },
            },
        ],
        ip: 0,
        op: TOTAL,
        st: 0,
        bm: 0,
    };
}

/** Hand-rolled Lottie JSON for the victory confetti. */
const confettiAnimationData = {
    v: '5.7.0',
    fr: FR,
    ip: 0,
    op: TOTAL,
    w: VIEW_W,
    h: VIEW_H,
    nm: 'victory-confetti',
    ddd: 0,
    assets: [],
    layers: Array.from({ length: PARTICLES }, (_, i) => makeParticleLayer(i)),
};

export function VictoryOverlay() {
    const isVictory = useGameStore((s) => s.isVictory);
    if (!isVictory) return null;

    return (
        <div
            data-testid="victory-overlay"
            // pointer-events-none: never block input — the player still
            // needs to walk + tap the teleporter to leave the level.
            className="pointer-events-none absolute inset-0 z-50 overflow-hidden"
        >
            <Lottie
                animationData={confettiAnimationData}
                loop
                autoplay
                style={{ width: '100%', height: '100%' }}
            />
        </div>
    );
}