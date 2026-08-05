import React, { useEffect, useRef, useState } from 'react';
import { Flame, Zap } from 'lucide-react';

import { EventBus } from '@/lib/events/bus';
import { isMobileLike, toAppPoint } from '@/lib/mobile';
import { useHudScale } from '@/lib/use-hud-scale';

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
const FIRE_BUTTON_PX = 96;
const DODGE_BUTTON_PX = 80;
const CLUSTER_GAP_PX = 14;
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
    // Floating joystick: summoned wherever the player taps on the
    // left half of the screen, hidden the moment they release. This
    // matches the mobile-joystick convention (Genshin / PUBG) where
    // the base is fixed only at the moment of contact, not anchored
    // to the bottom-left corner — thumbs land naturally wherever
    // the device is being held.
    const [joystickActive, setJoystickActive] = useState<boolean>(false);
    const [joystickPos, setJoystickPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const joystickRef = useRef<JoystickState | null>(null);
    const firingRef = useRef<boolean>(false);
    const dodgeRef = useRef<boolean>(false);
    const { scale, width, height } = useHudScale();

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
        // Right half is reserved for the FIRE/DODGE cluster — ignore
        // taps there so a stray press on the action buttons doesn't
        // also summon a ghost joystick underneath them.
        const layerX = e.clientX / scale;
        if (layerX > (width / scale) / 2) return;

        // Position the joystick centred on the touch point, then clamp
        // so the full base fits inside the layer (touches near a screen
        // edge would otherwise hang the ring off-canvas).
        const radius = JOYSTICK_BASE_PX / 2;
        const layerW = width / scale;
        const layerH = height / scale;
        const rawCx = layerX - radius;
        const rawCy = e.clientY / scale - radius;
        const cx = Math.max(8, Math.min(layerW - JOYSTICK_BASE_PX - 8, rawCx));
        const cy = Math.max(8, Math.min(layerH - JOYSTICK_BASE_PX - 8, rawCy));

        joystickRef.current = {
            pointerId: e.pointerId,
            // Store the original touch point in screen px so the move
            // handler can delta against it without re-converting.
            centerX: e.clientX,
            centerY: e.clientY,
        };
        setJoystickPos({ x: cx, y: cy });
        setJoystickActive(true);
        setKnobOffset({ x: 0, y: 0 });
        e.currentTarget.setPointerCapture(e.pointerId);
    };
    const handleJoystickMove = (e: React.PointerEvent<HTMLDivElement>): void => {
        const js = joystickRef.current;
        if (!js || js.pointerId !== e.pointerId) return;
        const p = toAppPoint(e.clientX, e.clientY);
        // ÷ scale: the delta is in on-screen px, the knob is positioned
        // in the layer's pre-scale px.
        const dx = (p.x - js.centerX) / scale;
        const dy = (p.y - js.centerY) / scale;
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
        setJoystickActive(false);
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
        <div
            className="fixed left-0 top-0 z-30 pointer-events-none select-none touch-none"
            style={{
                width: `${width / scale}px`,
                height: `${height / scale}px`,
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
            }}
        >
            {/* Left-half catch zone — full-height strip that listens
               for pointer-down anywhere the player might naturally
               rest their thumb. Width is 50% of the layer (the right
               half belongs to FIRE/DODGE); once a touch lands here
               we capture the pointer so subsequent move/up events
               keep flowing even if the thumb drifts outside. */}
            <div
                className="absolute pointer-events-auto"
                style={{
                    left: 0,
                    top: 0,
                    width: (width / scale) / 2,
                    height: height / scale,
                    touchAction: 'none',
                }}
                onPointerDown={handleJoystickStart}
                onPointerMove={handleJoystickMove}
                onPointerUp={handleJoystickEnd}
                onPointerCancel={handleJoystickEnd}
                data-testid="touch-joystick-zone"
            />

            {/* Floating joystick — invisible until the player taps
               anywhere on the left half of the screen, then renders
               centred on the touch point. pointer-events-none keeps
               the base from re-triggering the summon on subsequent
               events; the catch zone above handles the pointer stream
               once it's been captured. */}
            {joystickActive && (
                <div
                    className="absolute pointer-events-none"
                    style={{
                        left: joystickPos.x,
                        top: joystickPos.y,
                        width: JOYSTICK_BASE_PX,
                        height: JOYSTICK_BASE_PX,
                    }}
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
                            transition: 'none',
                            transform: 'translate(0,0)',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                        }}
                    />
                </div>
            )}

            {/* DODGE — sky-blue, left of FIRE. Lightning glyph reads
               as "dash / quick step" at a glance; size scales with
               the larger button so the icon stays the visual anchor. */}
            <button
                type="button"
                className="absolute pointer-events-auto rounded-full border-2 border-sky-200 bg-gradient-to-b from-sky-400/60 to-sky-600/60 backdrop-blur-sm text-sky-50 flex items-center justify-center active:from-sky-300/70 active:to-sky-500/70 transition-colors"
                style={makeBtnStyle(DODGE_BUTTON_PX, DODGE_BUTTON_PX, dodgeRight)}
                onPointerDown={dodgeDown}
                onPointerUp={dodgeUp}
                onPointerCancel={dodgeUp}
                data-testid="touch-dodge"
                aria-label="Dodge"
            >
                <Zap className="size-10 fill-sky-100 stroke-sky-50 drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]" />
            </button>

            {/* FIRE — rightmost, primary attack. Flame glyph sells the
               "primary action" weight; subtle gradient gives the
               bigger circle more depth than a flat fill. */}
            <button
                type="button"
                className="absolute pointer-events-auto rounded-full border-2 border-red-200 bg-gradient-to-b from-red-400/60 to-red-600/60 backdrop-blur-sm text-red-50 flex items-center justify-center active:from-red-300/70 active:to-red-500/70 transition-colors"
                style={makeBtnStyle(FIRE_BUTTON_PX, FIRE_BUTTON_PX, fireRight)}
                onPointerDown={shootDown}
                onPointerUp={shootUp}
                onPointerCancel={shootUp}
                data-testid="touch-shoot"
                aria-label="Fire"
            >
                <Flame className="size-12 fill-red-100 stroke-red-50 drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]" />
            </button>
        </div>
    );
};
