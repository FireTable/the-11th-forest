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
            className="absolute top-26 right-6 pointer-events-none select-none transition-transform duration-100 ease-out z-20 origin-top-right"
            style={{
                transform: punch ? 'scale(1.12)' : 'scale(1)',
                filter: `drop-shadow(0 2px 10px ${tierGlow})`,
            }}
        >
            <div className="flex flex-col items-end">
                <div className="flex items-baseline gap-1.5 font-black italic tracking-wider font-mono">
                    <span
                        className="text-[10px] uppercase font-extrabold tracking-widest px-1.5 py-0.5 rounded-xs bg-black/80 backdrop-blur-sm border shadow-xs"
                        style={{
                            color: tierColor,
                            borderColor: `${tierColor}66`,
                            boxShadow: `0 0 6px ${tierGlow}`,
                        }}
                    >
                        {tierTitle}
                    </span>
                    <span
                        className={`${combo >= 25 ? 'text-4xl' : 'text-3xl'} font-black drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)]`}
                        style={{
                            color: tierColor,
                            textShadow: `0 0 12px ${tierGlow}, 0 2px 0 #000, 2px 2px 0 #000, -1px -1px 0 #000`,
                        }}
                    >
                        {combo}
                    </span>
                    <span className="text-xs text-white/90 font-black uppercase tracking-tight drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                        HITS
                    </span>
                </div>

                {/* 3s shrinking combo timeout timer bar with direct high-performance rAF updates */}
                <div className="w-28 h-2 bg-black/70 rounded-full overflow-hidden mt-1 border border-white/20 backdrop-blur-sm p-[1px] shadow-[0_2px_6px_rgba(0,0,0,0.5)]">
                    <div
                        ref={barRef}
                        className="h-full w-full rounded-full"
                        style={{
                            backgroundColor: tierColor,
                            boxShadow: `0 0 8px ${tierColor}, inset 0 1px 1px rgba(255,255,255,0.4)`,
                        }}
                    />
                </div>
            </div>
        </div>
    );
};
