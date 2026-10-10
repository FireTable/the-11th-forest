import React, { useEffect, useState, useRef } from 'react';
import { EventBus } from '@/lib/events/bus';

export const ComboOverlay: React.FC = () => {
    const [combo, setCombo] = useState(0);
    const [punch, setPunch] = useState(false);
    const lastHitTimeRef = useRef<number>(0);
    const animFrameRef = useRef<number | null>(null);
    const barRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleCombo = (payload?: { count: number }) => {
            if (!payload || payload.count < 2) {
                setCombo(0);
                if (animFrameRef.current) {
                    cancelAnimationFrame(animFrameRef.current);
                    animFrameRef.current = null;
                }
                return;
            }
            lastHitTimeRef.current = performance.now();
            setCombo(payload.count);
            setPunch(true);
            setTimeout(() => setPunch(false), 130);

            // Reset progress bar width to 100% immediately on new hit
            if (barRef.current) {
                barRef.current.style.width = '100%';
            }
        };

        EventBus.on('combat:combo', handleCombo);
        return () => {
            EventBus.off('combat:combo', handleCombo);
        };
    }, []);

    // 60/120 FPS high-precision progress bar decay ticker (3000ms combo decay)
    useEffect(() => {
        if (combo < 2) {
            if (animFrameRef.current) {
                cancelAnimationFrame(animFrameRef.current);
                animFrameRef.current = null;
            }
            return;
        }

        const tick = () => {
            const elapsed = performance.now() - lastHitTimeRef.current;
            const ratio = Math.max(0, Math.min(1, 1 - elapsed / 3000));

            // Directly drive DOM element width for ultra-smooth 60/120 FPS rendering
            if (barRef.current) {
                barRef.current.style.width = `${(ratio * 100).toFixed(1)}%`;
            }

            if (ratio > 0) {
                animFrameRef.current = requestAnimationFrame(tick);
            } else {
                setCombo(0);
            }
        };

        animFrameRef.current = requestAnimationFrame(tick);
        return () => {
            if (animFrameRef.current) {
                cancelAnimationFrame(animFrameRef.current);
                animFrameRef.current = null;
            }
        };
    }, [combo]);

    if (combo < 2) return null;

    // Aesthetic color styling based on combo threshold
    let tierColor = '#38bdf8'; // Sky blue
    let tierGlow = 'rgba(56, 189, 248, 0.6)';
    let tierTitle = 'HIT';

    if (combo >= 50) {
        tierColor = '#f43f5e'; // Rose / crimson
        tierGlow = 'rgba(244, 63, 94, 0.85)';
        tierTitle = 'MAX FEVER';
    } else if (combo >= 25) {
        tierColor = '#f97316'; // Vivid orange
        tierGlow = 'rgba(249, 115, 22, 0.75)';
        tierTitle = 'RAMPAGE';
    } else if (combo >= 10) {
        tierColor = '#fbbf24'; // Gold
        tierGlow = 'rgba(251, 191, 36, 0.7)';
        tierTitle = 'COMBO';
    }

    return (
        <div
            className="absolute top-20 right-8 pointer-events-none select-none transition-transform duration-100 ease-out z-20"
            style={{
                transform: punch ? 'scale(1.35)' : 'scale(1)',
                filter: `drop-shadow(0 4px 16px ${tierGlow})`,
            }}
        >
            <div className="flex flex-col items-end">
                <div className="flex items-baseline gap-2 font-black italic tracking-wider font-mono">
                    <span
                        className="text-xs uppercase font-extrabold tracking-widest px-2 py-0.5 rounded-sm bg-black/75 backdrop-blur-sm border shadow-sm"
                        style={{
                            color: tierColor,
                            borderColor: `${tierColor}66`,
                            boxShadow: `0 0 8px ${tierGlow}`,
                        }}
                    >
                        {tierTitle}
                    </span>
                    <span
                        className={`${combo >= 25 ? 'text-6xl' : 'text-5xl'} font-black drop-shadow-[0_3px_6px_rgba(0,0,0,0.95)]`}
                        style={{
                            color: tierColor,
                            textShadow: `0 0 16px ${tierGlow}, 0 2px 0 #000, 3px 3px 0 #000, -2px -2px 0 #000`,
                        }}
                    >
                        {combo}
                    </span>
                    <span className="text-base text-white/90 font-black uppercase tracking-tight drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                        HITS
                    </span>
                </div>

                {/* 3s shrinking combo timeout timer bar with direct high-performance rAF updates */}
                <div className="w-36 h-2.5 bg-black/70 rounded-full overflow-hidden mt-1.5 border border-white/25 backdrop-blur-sm p-[1px] shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
                    <div
                        ref={barRef}
                        className="h-full w-full rounded-full"
                        style={{
                            backgroundColor: tierColor,
                            boxShadow: `0 0 10px ${tierColor}, inset 0 1px 1px rgba(255,255,255,0.45)`,
                        }}
                    />
                </div>
            </div>
        </div>
    );
};
