import React, { useEffect, useRef, useState } from 'react';

import { EventBus } from '@/lib/events/bus';
import { isMobileLike } from '@/lib/mobile';

/**
 * src/components/hud/TouchControls.tsx
 * --------------------------------------------------------------------------
 * Mobile-only DOM overlay: virtual joystick (bottom-left) + a two-button
 * cluster [DODGE] [FIRE] (bottom-right). Pure additive — does not
 * interfere with keyboard/mouse on desktop (not rendered there at all).
 *
 * Wire model: each control owns its pointer stream and emits structured
 * events on `@/lib/events/bus`:
 *
 *   - `mobile:move`        { vx, vy } | null      (joystick, normalised)
 *   - `mobile:firing`      boolean                (FIRE button)
 *   - `mobile:dodge`       boolean                (DODGE button)
 *
 * Weapon switching lives on the WeaponHUDOverlay's slot strip — tapping
 * a thumbnail there emits `mobile:weapon:switch` which the controller
 * handles. We intentionally don't show ◀/▶ here: the slot strip is the
 * canonical "which weapon am I using" surface.
 *
 * Render condition: `isMobileLike()` only, re-evaluated on resize.
 */

const JOYSTICK_BASE_PX = 140;
const JOYSTICK_KNOB_PX = 64;
const FIRE_BUTTON_PX = 72;
const DODGE_BUTTON_PX = 56;
const CLUSTER_GAP_PX = 12;
const CLUSTER_BOTTOM_PX = 24;
const CLUSTER_RIGHT_PX = 16;
const DEAD_ZONE = 0.12;

interface JoystickState {
    pointerId: number;
    centerX: number;
    centerY: number;
}

export const TouchControls: React.FC = () => {
    const [visible, setVisible] = useState<boolean>(false);
    const [knobOffset, setKnobOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const joystickRef = useRef<JoystickState | null>(null);
    const firingRef = useRef<boolean>(false);
    const dodgeRef = useRef<boolean>(false);

    useEffect(() => {
        const evaluate = (): void => setVisible(isMobileLike());
        evaluate();
        window.addEventListener('resize', evaluate);
        return () => window.removeEventListener('resize', evaluate);
    }, []);

    if (!visible) return null;

    const maxOffset = (JOYSTICK_BASE_PX - JOYSTICK_KNOB_PX) / 2;
    const clampOffset = (x: number, y: number) => {
        const len = Math.hypot(x, y);
        if (len === 0) return { x: 0, y: 0 };
        if (len <= maxOffset) return { x, y };
        return { x: (x / len) * maxOffset, y: (y / len) * maxOffset };
    };

    const handleJoystickStart = (e: React.PointerEvent<HTMLDivElement>): void => {
        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
        joystickRef.current = {
            pointerId: e.pointerId,
            centerX: rect.left + rect.width / 2,
            centerY: rect.top + rect.height / 2,
        };
        (e.target as Element).setPointerCapture(e.pointerId);
    };
    const handleJoystickMove = (e: React.PointerEvent<HTMLDivElement>): void => {
        const js = joystickRef.current;
        if (!js || js.pointerId !== e.pointerId) return;
        const dx = e.clientX - js.centerX;
        const dy = e.clientY - js.centerY;
        const clamped = clampOffset(dx, dy);
        setKnobOffset(clamped);
        const rawLen = Math.hypot(clamped.x, clamped.y);
        if (rawLen / maxOffset < DEAD_ZONE) {
            EventBus.emit('mobile:move', null);
        } else {
            const vx = clamped.x / maxOffset;
            const vy = clamped.y / maxOffset;
            EventBus.emit('mobile:move', { vx, vy });
        }
    };
    const handleJoystickEnd = (e: React.PointerEvent<HTMLDivElement>): void => {
        const js = joystickRef.current;
        if (!js || js.pointerId !== e.pointerId) return;
        joystickRef.current = null;
        setKnobOffset({ x: 0, y: 0 });
        EventBus.emit('mobile:move', null);
    };

    const shootDown = (e: React.PointerEvent<HTMLButtonElement>): void => {
        e.preventDefault();
        firingRef.current = true;
        EventBus.emit('mobile:firing', true);
        (e.target as Element).setPointerCapture(e.pointerId);
    };
    const shootUp = (e: React.PointerEvent<HTMLButtonElement>): void => {
        e.preventDefault();
        firingRef.current = false;
        EventBus.emit('mobile:firing', false);
    };
    const dodgeDown = (e: React.PointerEvent<HTMLButtonElement>): void => {
        e.preventDefault();
        dodgeRef.current = true;
        EventBus.emit('mobile:dodge', true);
        (e.target as Element).setPointerCapture(e.pointerId);
    };
    const dodgeUp = (e: React.PointerEvent<HTMLButtonElement>): void => {
        e.preventDefault();
        dodgeRef.current = false;
        EventBus.emit('mobile:dodge', false);
    };

    // Cluster geometry — two buttons in a horizontal row, anchored to
    // the bottom-right corner. FIRE is the rightmost (anchor), DODGE
    // sits to its left.
    const fireRight = CLUSTER_RIGHT_PX;
    const dodgeRight = fireRight + FIRE_BUTTON_PX + CLUSTER_GAP_PX;
    const makeBtnStyle = (w: number, h: number, right: number): React.CSSProperties => ({
        position: 'absolute',
        bottom: CLUSTER_BOTTOM_PX,
        right,
        width: w,
        height: h,
        boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
        touchAction: 'none',
    });

    return (
        <div className="fixed inset-0 z-30 pointer-events-none select-none touch-none">
            {/* Joystick — bottom-left */}
            <div
                className="absolute pointer-events-auto"
                style={{
                    bottom: 24,
                    left: 24,
                    width: JOYSTICK_BASE_PX,
                    height: JOYSTICK_BASE_PX,
                }}
                onPointerDown={handleJoystickStart}
                onPointerMove={handleJoystickMove}
                onPointerUp={handleJoystickEnd}
                onPointerCancel={handleJoystickEnd}
                data-testid="touch-joystick"
            >
                <div
                    className="absolute inset-0 rounded-full border-2 border-amber-400/60 bg-stone-950/30 backdrop-blur-sm"
                    style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.5)' }}
                />
                <div
                    className="absolute rounded-full bg-amber-400 border-2 border-amber-200"
                    style={{
                        width: JOYSTICK_KNOB_PX,
                        height: JOYSTICK_KNOB_PX,
                        left: JOYSTICK_BASE_PX / 2 - JOYSTICK_KNOB_PX / 2 + knobOffset.x,
                        top: JOYSTICK_BASE_PX / 2 - JOYSTICK_KNOB_PX / 2 + knobOffset.y,
                        transition: joystickRef.current ? 'none' : 'transform 0.15s ease-out',
                        transform: 'translate(0,0)',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                    }}
                />
            </div>

            {/* DODGE — sky-blue, left of FIRE */}
            <button
                type="button"
                className="absolute pointer-events-auto rounded-full border-2 border-sky-300 bg-sky-500/40 backdrop-blur-sm text-sky-100 font-['Silkscreen',monospace] text-[10px] font-bold flex items-center justify-center active:bg-sky-400/60"
                style={makeBtnStyle(DODGE_BUTTON_PX, DODGE_BUTTON_PX, dodgeRight)}
                onPointerDown={dodgeDown}
                onPointerUp={dodgeUp}
                onPointerCancel={dodgeUp}
                data-testid="touch-dodge"
                aria-label="Dodge"
            >
                DODGE
            </button>

            {/* FIRE — rightmost, primary attack */}
            <button
                type="button"
                className="absolute pointer-events-auto rounded-full border-2 border-red-300 bg-red-500/40 backdrop-blur-sm text-red-100 font-['Silkscreen',monospace] text-sm font-bold flex items-center justify-center active:bg-red-400/60"
                style={makeBtnStyle(FIRE_BUTTON_PX, FIRE_BUTTON_PX, fireRight)}
                onPointerDown={shootDown}
                onPointerUp={shootUp}
                onPointerCancel={shootUp}
                data-testid="touch-shoot"
                aria-label="Fire"
            >
                FIRE
            </button>
        </div>
    );
};
