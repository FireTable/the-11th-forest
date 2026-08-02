import { forwardRef, useEffect, useLayoutEffect, useRef } from 'react';
import StartGame from '@/game/main';
import { EventBus } from '@/lib/events/bus';
import { setPhaserGame } from '@/lib/phaser-game';

export interface IRefPhaserGame {
    game: Phaser.Game | null;
    scene: Phaser.Scene | null;
}

interface IProps {
    currentActiveScene?: (scene_instance: Phaser.Scene) => void;
}

// Module-level cache so React 19 StrictMode's double-invoked effect
// (dev only) doesn't trigger two StartGame() calls and double-fetch every
// asset. The promise is shared across mounts of the same parent.
let cachedGame: Phaser.Game | null = null;
let cachedPromise: Promise<Phaser.Game> | null = null;

async function startGameOnce(parent: string): Promise<Phaser.Game> {
    if (cachedGame) return cachedGame;
    if (!cachedPromise) {
        cachedPromise = StartGame(parent).then((g) => {
            cachedGame = g;
            cachedPromise = null;
            return g;
        });
    }
    return cachedPromise;
}

// Tear down on real page exit (HMR / navigation). StrictMode's
// double-unmount is harmless: cachedGame is still alive, only destroyed
// here once.
function teardown(): void {
    if (cachedGame) {
        cachedGame.destroy(true);
        cachedGame = null;
        cachedPromise = null;
    }
}

export const PhaserGame = forwardRef<IRefPhaserGame, IProps>(function PhaserGame(
    { currentActiveScene },
    ref,
) {
    const game = useRef<Phaser.Game | null>(null!);

    useLayoutEffect(() => {
        let mounted = true;

        startGameOnce('game-container').then((g) => {
            if (!mounted) return; // StrictMode second mount already won
            game.current = g;
            // Publish for the editor's in-process restart path
            // (src/lib/phaser-game.ts). Runs once after StartGame resolves.
            setPhaserGame(g);
            if (typeof ref === 'function') {
                ref({ game: g, scene: null });
            } else if (ref) {
                ref.current = { game: g, scene: null };
            }
        });

        return () => {
            mounted = false;
            // Don't destroy the game here — cachedGame is module-level and
            // may be in use by the second StrictMode mount. The browser's
            // page lifecycle tears it down via the `pagehide` listener.
        };
    }, [ref]);

    useEffect(() => {
        const onPageHide = (): void => teardown();
        window.addEventListener('pagehide', onPageHide);

        EventBus.on('current-scene-ready', (scene_instance: Phaser.Scene) => {
            if (currentActiveScene && typeof currentActiveScene === 'function') {
                currentActiveScene(scene_instance);
            }
            if (typeof ref === 'function') {
                ref({ game: game.current, scene: scene_instance });
            } else if (ref) {
                ref.current = { game: game.current, scene: scene_instance };
            }
        });

        return () => {
            window.removeEventListener('pagehide', onPageHide);
            EventBus.removeListener('current-scene-ready');
        };
    }, [currentActiveScene, ref]);

    return <div id="game-container"></div>;
});
