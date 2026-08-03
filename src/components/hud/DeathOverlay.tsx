/**
 * src/components/hud/DeathOverlay.tsx
 * --------------------------------------------------------------------------
 * Full-screen "you died" overlay with a Restart button. Rendered by
 * GameHUDLayer when `useGameStore().isDead` is true; the Phaser scene
 * is already paused at that point (see Character.handleDeath).
 *
 * Restart goes through `restartCurrentLevel` — the same helper the
 * settings panel uses. The Phaser scene is destroyed and a fresh
 * LoadScene is constructed with full HP from the spec.
 */

import { Skull } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { restartCurrentLevel } from '@/lib/phaser-game';
import { useGameStore } from '@/store/game-store';

export function DeathOverlay() {
    const isDead = useGameStore((s) => s.isDead);
    if (!isDead) return null;

    return (
        <div
            data-testid="death-overlay"
            className="pointer-events-auto absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
        >
            <div className="flex flex-col items-center gap-4 rounded border border-red-700/60 bg-neutral-900/95 px-10 py-8 font-mono text-neutral-100 shadow-2xl">
                <Skull className="size-12 text-red-500" />
                <div className="text-2xl font-bold tracking-widest text-red-400">YOU DIED</div>
                <div className="text-[11px] uppercase tracking-wider text-neutral-500">
                    The forest claims another wanderer.
                </div>
                <Button
                    onClick={restartCurrentLevel}
                    className="mt-2 h-9 bg-cyan-500 px-6 font-semibold text-black hover:bg-cyan-400"
                >
                    Restart
                </Button>
            </div>
        </div>
    );
}
