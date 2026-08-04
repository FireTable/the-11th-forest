/**
 * src/components/hud/SettingsOverlay.tsx
 * --------------------------------------------------------------------------
 * Top-right chrome: a GitHub link and a gear that opens the settings hub.
 *
 * Opening the hub pauses the running scene the same way death does
 * (`scene.scene.pause()` — freezes physics, tweens and timers without
 * touching `game.pause()`, which the tab-hide handler owns) and pauses
 * the music. Resume undoes both; Restart reuses the editor's
 * `restartSceneWith` path, same as the death overlay.
 *
 * Rendered inside GameHUDLayer rather than a portal so it inherits the
 * HUD scale and the forced-landscape rotation.
 */

import { useEffect, useRef, useState } from 'react';
import { RotateCcw, Play, Settings, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { MUSIC_PAUSE, MUSIC_RESUME } from '@/lib/constants';
import { EventBus } from '@/lib/events/bus';
import { getPhaserGame, restartCurrentLevel } from '@/lib/phaser-game';

import { CornerPixels, RETRO_BOX } from './retro-box';

const REPO_URL = 'https://github.com/FireTable/the-11th-forest';

/** lucide 1.x dropped brand icons, so the mark is inlined rather than
 *  pulling in a whole brand-icon package for one glyph. */
function GithubMark() {
    return (
        <svg viewBox="0 0 24 24" fill="currentColor" className="size-4" aria-hidden="true">
            <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
        </svg>
    );
}

export function SettingsOverlay() {
    const [open, setOpen] = useState(false);
    // The scene we paused, so resume hits the same one even if a
    // teleport registered another in the meantime.
    const paused = useRef<Phaser.Scene | null>(null);

    function pauseGame() {
        const scene = getPhaserGame()?.scene.getScenes(true)[0] ?? null;
        scene?.scene.pause();
        paused.current = scene;
        EventBus.emit(MUSIC_PAUSE);
        setOpen(true);
    }

    function resumeGame() {
        paused.current?.scene.resume();
        paused.current = null;
        EventBus.emit(MUSIC_RESUME);
        setOpen(false);
    }

    function handleRestart() {
        // The old scene is destroyed wholesale, so its paused state goes
        // with it — just drop our reference and let the music resume.
        paused.current = null;
        setOpen(false);
        EventBus.emit(MUSIC_RESUME);
        restartCurrentLevel();
    }

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') resumeGame();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });

    return (
        <>
            <div className="pointer-events-auto absolute top-6 right-6 z-30 flex items-center gap-3 select-none">
                <a
                    href={REPO_URL}
                    target="_blank"
                    rel="noreferrer noopener"
                    title="Source on GitHub"
                    aria-label="Source on GitHub"
                    className={`${RETRO_BOX} relative flex size-8 items-center justify-center text-amber-500 transition-colors hover:text-amber-300`}
                >
                    <CornerPixels />
                    <GithubMark />
                </a>
                <button
                    type="button"
                    onClick={pauseGame}
                    title="Settings"
                    aria-label="Settings"
                    className={`${RETRO_BOX} relative flex size-8 items-center justify-center text-amber-500 transition-colors hover:text-amber-300`}
                >
                    <CornerPixels />
                    <Settings className="size-4" />
                </button>
            </div>

            {open && (
                <div
                    data-testid="settings-overlay"
                    onClick={resumeGame}
                    className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm"
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className={`${RETRO_BOX} relative flex w-72 flex-col items-center gap-5 px-8 py-7 font-['Silkscreen',monospace]`}
                    >
                        <CornerPixels />
                        <button
                            type="button"
                            onClick={resumeGame}
                            aria-label="Close"
                            className="absolute top-2 right-2 text-stone-500 transition-colors hover:text-amber-400"
                        >
                            <X className="size-4" />
                        </button>

                        <div className="text-base font-bold tracking-widest text-amber-500 uppercase drop-shadow-[1px_1px_0px_#000]">
                            Settings
                        </div>

                        <div className="flex w-full flex-col gap-2">
                            <Button
                                onClick={resumeGame}
                                className="h-9 w-full bg-amber-500 font-semibold text-black hover:bg-amber-400"
                            >
                                <Play className="size-4" />
                                Resume
                            </Button>
                            <Button
                                onClick={handleRestart}
                                variant="outline"
                                className="h-9 w-full border-stone-700 bg-stone-900/80 font-semibold text-stone-300 hover:bg-stone-800 hover:text-amber-300"
                            >
                                <RotateCcw className="size-4" />
                                Restart
                            </Button>
                        </div>

                        <div className="text-[9px] tracking-wider text-stone-500 uppercase">
                            Restart clears this level's progress
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
