/**
 * src/components/hud/victory-overlay.tsx
 * --------------------------------------------------------------------------
 * Full-screen "Victory" overlay with pure CSS confetti/sparkle animation
 * and a Restart/Return to Tavern button. Rendered by GameHUDLayer when
 * `useGameStore().isVictory` is true.
 */

import { Trophy, RotateCcw, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { restartAtTavern } from '@/lib/phaser-game';
import { useGameStore } from '@/store/game-store';

import { CornerPixels, RETRO_BOX } from './retro-box';

export function VictoryOverlay() {
    const isVictory = useGameStore((s) => s.isVictory);
    const characterName = useGameStore((s) => s.characterName);
    const levelElapsedMs = useGameStore((s) => s.levelElapsedMs);

    if (!isVictory) return null;

    // Format total time mm:ss
    const totalSec = Math.floor((levelElapsedMs || 0) / 1000);
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

    return (
        <div
            data-testid="victory-overlay"
            className="pointer-events-auto absolute inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm overflow-hidden select-none"
        >
            {/* CSS Confetti Particles */}
            <style>{`
                @keyframes confetti-fall {
                    0% { transform: translateY(-100%) rotate(0deg); opacity: 1; }
                    100% { transform: translateY(100vh) rotate(720deg); opacity: 0.2; }
                }
                .confetti-particle {
                    position: absolute;
                    top: -20px;
                    width: 10px;
                    height: 10px;
                    animation: confetti-fall 3.5s linear infinite;
                }
            `}</style>

            {/* Falling Confetti Bits */}
            {Array.from({ length: 24 }).map((_, i) => {
                const colors = ['#fbbf24', '#f59e0b', '#34d399', '#60a5fa', '#f472b6', '#a78bfa'];
                const color = colors[i % colors.length];
                const left = `${(i * 4.3 + 2) % 100}%`;
                const delay = `${(i * 0.25) % 3}s`;
                const duration = `${2.8 + (i % 4) * 0.4}s`;
                const size = i % 2 === 0 ? 'w-2 h-2.5 rounded-sm' : 'w-1.5 h-1.5 rounded-full';
                return (
                    <div
                        key={i}
                        className={`confetti-particle ${size}`}
                        style={{
                            left,
                            backgroundColor: color,
                            animationDelay: delay,
                            animationDuration: duration,
                        }}
                    />
                );
            })}

            <div
                className={`${RETRO_BOX} relative flex flex-col items-center gap-4 px-10 py-8 font-['Silkscreen',monospace] min-w-[290px]`}
            >
                <CornerPixels />

                {/* Trophy icon with glowing effect */}
                <div className="relative">
                    <Trophy
                        className="size-12 text-yellow-400"
                        style={{ filter: 'drop-shadow(0 0 12px rgba(251,191,36,0.85))' }}
                    />
                    <Sparkles className="absolute -top-1 -right-2 size-5 text-amber-200 animate-pulse" />
                </div>

                {/* Title + decorative divider */}
                <div className="flex flex-col items-center gap-1.5 w-full">
                    <div className="text-2xl font-bold tracking-[0.2em] text-amber-300 drop-shadow-[2px_2px_0px_#000] uppercase">
                        VICTORY!
                    </div>
                    <div className="flex items-center gap-2 w-full">
                        <span className="flex-1 h-px bg-amber-800/60" />
                        <span className="text-yellow-400 text-[10px] leading-none">✦</span>
                        <span className="flex-1 h-px bg-amber-800/60" />
                    </div>
                </div>

                {/* Clear Stats */}
                <div className="flex flex-col items-center gap-1 text-[11px] text-stone-300">
                    <div>HERO: <span className="text-amber-200 font-bold">{characterName || 'WANDERER'}</span></div>
                    <div>CLEAR TIME: <span className="text-amber-200 font-mono font-bold">{timeStr}</span></div>
                </div>

                {/* Subtitle */}
                <div className="text-[10px] uppercase tracking-wider text-amber-200/80 text-center leading-relaxed mt-1">
                    All waves cleared!<br />The 11th Forest is saved.
                </div>

                {/* Return button */}
                <Button
                    onClick={() => void restartAtTavern()}
                    className="mt-2 h-9 w-full bg-amber-500 px-6 font-['Silkscreen',monospace] font-bold text-black hover:bg-amber-400 tracking-wider uppercase text-xs rounded-none flex items-center justify-center gap-2"
                >
                    <RotateCcw className="size-4" />
                    Return to Tavern
                </Button>
            </div>
        </div>
    );
}
