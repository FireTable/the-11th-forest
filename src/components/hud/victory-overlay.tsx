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
 * Loads Lottie confetti animation remotely from `/assets/lottie/victory-confetti.json`.
 */

import Lottie from 'lottie-react';

import victoryConfettiData from '../../../public/assets/lottie/victory-confetti.json';
import { useGameStore } from '@/store/game-store';

export function VictoryOverlay() {
    const isVictory = useGameStore((s) => s.isVictory);

    if (!isVictory) return null;

    return (
        <div
            data-testid="victory-overlay"
            // pointer-events-none: never block input — the player still
            // needs to walk + tap the teleporter to leave the level.
            className="pointer-events-none absolute inset-0 z-[9999] flex items-center justify-center overflow-hidden"
        >
            <div className="w-[80%] h-[80%] flex items-center justify-center">
                <Lottie
                    animationData={victoryConfettiData}
                    loop={false}
                    autoplay
                    style={{ width: '100%', height: '100%', transform: 'scale(0.8)' }}
                />
            </div>
        </div>
    );
}