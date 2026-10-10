import React, { useEffect, useRef } from 'react';
import { EventBus } from '@/lib/events/bus';

/**
 * HurtVignetteOverlay
 * --------------------------------------------------------------------------
 * Visual juice: flashes a crimson 4-corner radial vignette + edge glow across
 * the viewport when the player takes damage ("暗角闪红").
 *
 * Driven via high-performance requestAnimationFrame directly on the DOM node's
 * opacity for smooth 60/120Hz decay without React re-render overhead.
 */
export const HurtVignetteOverlay: React.FC = () => {
    const overlayRef = useRef<HTMLDivElement>(null);
    const animFrameRef = useRef<number | null>(null);
    const lastHurtTimeRef = useRef<number>(0);

    useEffect(() => {
        const handlePlayerHurt = () => {
            lastHurtTimeRef.current = performance.now();
            if (overlayRef.current) {
                overlayRef.current.style.opacity = '1';
                overlayRef.current.style.display = 'block';
            }

            if (animFrameRef.current) {
                cancelAnimationFrame(animFrameRef.current);
            }

            const tick = () => {
                const elapsed = performance.now() - lastHurtTimeRef.current;
                const duration = 280; // 280ms visceral hurt vignette decay
                const ratio = Math.max(0, 1 - elapsed / duration);

                if (overlayRef.current) {
                    // Ease-out curve for natural camera lens flash decay
                    const easedOpacity = Math.pow(ratio, 1.5);
                    overlayRef.current.style.opacity = easedOpacity.toFixed(3);
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
                // Multi-layered 4-corner vignette gradient + inset perimeter glow
                background: `
                    radial-gradient(ellipse at center, transparent 40%, rgba(220, 38, 38, 0.25) 70%, rgba(185, 28, 28, 0.65) 100%),
                    radial-gradient(circle at 0% 0%, rgba(239, 68, 68, 0.75) 0%, transparent 45%),
                    radial-gradient(circle at 100% 0%, rgba(239, 68, 68, 0.75) 0%, transparent 45%),
                    radial-gradient(circle at 0% 100%, rgba(239, 68, 68, 0.75) 0%, transparent 45%),
                    radial-gradient(circle at 100% 100%, rgba(239, 68, 68, 0.75) 0%, transparent 45%)
                `,
                boxShadow: 'inset 0 0 90px 25px rgba(239, 68, 68, 0.55)',
            }}
        />
    );
};
