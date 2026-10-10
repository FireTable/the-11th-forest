import React, { useEffect, useRef } from 'react';
import { EventBus } from '@/lib/events/bus';

/**
 * HurtVignetteOverlay
 * --------------------------------------------------------------------------
 * Visual juice: subtle, silky crimson 4-corner micro-vignette flash when taking damage.
 * Confined strictly to the outermost 4 corner tips (center 75%+ remains clear),
 * with soft transparency and smooth 380ms ease-out decay to avoid eye strain.
 */
export const HurtVignetteOverlay: React.FC = () => {
    const overlayRef = useRef<HTMLDivElement>(null);
    const animFrameRef = useRef<number | null>(null);
    const lastHurtTimeRef = useRef<number>(0);

    useEffect(() => {
        const handlePlayerHurt = () => {
            lastHurtTimeRef.current = performance.now();
            if (overlayRef.current) {
                overlayRef.current.style.opacity = '0.5';
                overlayRef.current.style.display = 'block';
            }

            if (animFrameRef.current) {
                cancelAnimationFrame(animFrameRef.current);
            }

            const tick = () => {
                const elapsed = performance.now() - lastHurtTimeRef.current;
                const duration = 380; // 380ms silky smooth hurt decay
                const ratio = Math.max(0, 1 - elapsed / duration);

                if (overlayRef.current) {
                    // Soft cubic ease-out decay capped at 0.5 peak opacity
                    const eased = Math.pow(ratio, 1.8);
                    const opacity = (eased * 0.5).toFixed(3);
                    overlayRef.current.style.opacity = opacity;
                }

                if (ratio > 0) {
                    animFrameRef.current = requestAnimationFrame(tick);
                } else {
                    if (overlayRef.current) {
                        overlayRef.current.style.opacity = '0';
                        overlayRef.current.style.display = 'none';
                    }
                    animFrameRef.current = null;
                }
            };

            animFrameRef.current = requestAnimationFrame(tick);
        };

        EventBus.on('combat:player-hurt', handlePlayerHurt);
        return () => {
            EventBus.off('combat:player-hurt', handlePlayerHurt);
            if (animFrameRef.current) {
                cancelAnimationFrame(animFrameRef.current);
            }
        };
    }, []);

    return (
        <div
            ref={overlayRef}
            data-testid="hurt-vignette-overlay"
            className="absolute inset-0 pointer-events-none z-0 select-none"
            style={{
                display: 'none',
                opacity: 0,
                // Soft micro-vignette strictly in outer corner tips (center 75% 100% clear)
                background: `
                    radial-gradient(ellipse at center, transparent 72%, rgba(220, 38, 38, 0.12) 88%, rgba(185, 28, 28, 0.35) 100%),
                    radial-gradient(circle at 0% 0%, rgba(220, 38, 38, 0.45) 0%, transparent 22%),
                    radial-gradient(circle at 100% 0%, rgba(220, 38, 38, 0.45) 0%, transparent 22%),
                    radial-gradient(circle at 0% 100%, rgba(220, 38, 38, 0.45) 0%, transparent 22%),
                    radial-gradient(circle at 100% 100%, rgba(220, 38, 38, 0.45) 0%, transparent 22%)
                `,
                boxShadow: 'inset 0 0 35px 8px rgba(220, 38, 38, 0.25)',
            }}
        />
    );
};
