import React, { useEffect, useState } from 'react';

import { requestLandscapeLock } from '@/lib/mobile';

/**
 * Full-screen "rotate to landscape" overlay. Only mounts when both
 *   - the viewport looks mobile (`pointer: coarse`) AND
 *   - it's currently portrait
 * The overlay hides itself once the viewport flips wide, and asks for
 * `screen.orientation.lock` on first tap (browsers require a gesture).
 */
export const RotateOverlay: React.FC = () => {
    const [visible, setVisible] = useState<boolean>(false);
    const [coarsePointer, setCoarsePointer] = useState<boolean>(false);

    useEffect(() => {
        const coarseMql = window.matchMedia('(pointer: coarse)');
        const evaluate = (): void => {
            setCoarsePointer(coarseMql.matches);
            setVisible(coarseMql.matches && window.innerHeight > window.innerWidth);
        };
        evaluate();
        const onResize = (): void => evaluate();
        window.addEventListener('resize', onResize);
        const onGesture = (): void => {
            requestLandscapeLock();
            window.removeEventListener('pointerdown', onGesture);
        };
        window.addEventListener('pointerdown', onGesture, { once: true });
        return () => {
            window.removeEventListener('resize', onResize);
            window.removeEventListener('pointerdown', onGesture);
        };
    }, []);

    if (!visible || !coarsePointer) return null;

    return (
        <div
            className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black text-white gap-4 select-none"
            data-testid="rotate-overlay"
            role="dialog"
            aria-label="Rotate to landscape"
        >
            <div className="text-6xl animate-pulse">📱↻</div>
            <p className="font-['Silkscreen',monospace] text-amber-300 text-sm tracking-widest text-center px-6">
                ROTATE TO LANDSCAPE
            </p>
            <p className="font-['Silkscreen',monospace] text-stone-400 text-[10px] tracking-widest text-center px-6">
                The forest lies sideways
            </p>
        </div>
    );
};
