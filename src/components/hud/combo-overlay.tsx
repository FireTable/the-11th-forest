import React, { useEffect, useState, useRef } from 'react';
import { EventBus } from '@/lib/events/bus';

export const ComboOverlay: React.FC = () => {
    const [combo, setCombo] = useState(0);
    const [punch, setPunch] = useState(false);
    const [remainingRatio, setRemainingRatio] = useState(1);
    const lastHitTimeRef = useRef<number>(0);
    const animFrameRef = useRef<number | null>(null);

    useEffect(() => {
        const handleCombo = (payload?: { count: number }) => {
            if (!payload || payload.count < 2) {
                setCombo(0);
                return;
            }
            lastHitTimeRef.current = performance.now();
            setCombo(payload.count);
            setPunch(true);
            setTimeout(() => setPunch(false), 120);
        };

        EventBus.on('combat:combo', handleCombo);
        return () => {
            EventBus.off('combat:combo', handleCombo);
        };
    }, []);

    // Progress bar decay ticker (2000ms combo decay)
    useEffect(() => {
        if (combo < 2) {
            setRemainingRatio(0);
            return;
        }

        const tick = () => {
            const elapsed = performance.now() - lastHitTimeRef.current;
            const ratio = Math.max(0, 1 - elapsed / 2000);
            setRemainingRatio(ratio);

            if (ratio > 0) {
                animFrameRef.current = requestAnimationFrame(tick);
            } else {
                setCombo(0);
            }
        };

        animFrameRef.current = requestAnimationFrame(tick);
        return () => {
            if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        };
    }, [combo]);

    if (combo < 2) return null;

    // Aesthetic color styling based on combo threshold
    let tierColor = '#38bdf8'; // Sky blue
    let tierGlow = 'rgba(56, 189, 248, 0.45)';
    let tierTitle = 'HIT';

    if (combo >= 50) {
        tierColor = '#f43f5e'; // Rose / crimson
        tierGlow = 'rgba(244, 63, 94, 0.65)';
        tierTitle = 'MAX FEVER';
    } else if (combo >= 25) {
        tierColor = '#f97316'; // Orange
        tierGlow = 'rgba(249, 115, 22, 0.6)';
        tierTitle = 'RAMPAGE';
    } else if (combo >= 10) {
        tierColor = '#fbbf24'; // Gold
        tierGlow = 'rgba(251, 191, 36, 0.55)';
        tierTitle = 'COMBO';
    }

    return (
        <div
            className="absolute top-24 right-8 pointer-events-none select-none transition-transform duration-100 ease-out z-20"
            style={{
                transform: punch ? 'scale(1.25)' : 'scale(1)',
                filter: `drop-shadow(0 4px 12px ${tierGlow})`,
            }}
        >
            <div className="flex flex-col items-end">
                <div className="flex items-baseline gap-1.5 font-black italic tracking-wider font-mono">
                    <span
                        className="text-xs uppercase font-extrabold tracking-widest px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-sm border border-white/20"
                        style={{ color: tierColor }}
                    >
                        {tierTitle}
                    </span>
                    <span
                        className="text-4xl text-white font-black drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]"
                        style={{
                            color: tierColor,
                            textShadow: `0 0 10px ${tierGlow}, 0 2px 0 #000, 2px 2px 0 #000, -2px -2px 0 #000`,
                        }}
                    >
                        {combo}
                    </span>
                    <span className="text-sm text-white/80 font-bold uppercase tracking-tighter">
                        HITS
                    </span>
                </div>

                {/* Shrinking combo timeout timer bar */}
                <div className="w-28 h-1.5 bg-black/50 rounded-full overflow-hidden mt-1 border border-white/10 backdrop-blur-xs">
                    <div
                        className="h-full rounded-full transition-[width] duration-75"
                        style={{
                            width: `${remainingRatio * 100}%`,
                            backgroundColor: tierColor,
                            boxShadow: `0 0 6px ${tierColor}`,
                        }}
                    />
                </div>
            </div>
        </div>
    );
};
