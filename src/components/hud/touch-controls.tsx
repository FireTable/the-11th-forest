import React, { useEffect, useRef, useState } from 'react';
import { Flame, Zap } from 'lucide-react';

import { EventBus } from '@/lib/events/bus';
import { isMobileLike, toAppPoint } from '@/lib/mobile';
import { useHudScale } from '@/lib/use-hud-scale';
import { useGameStore } from '@/store/game-store';

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
 * High-performance mobile implementation:
 * 1. Strictly hidden during Tavern Character Selection (!tavernCleared)
 *    so tapping character sprites is not intercepted by the joystick catch zone.
 * 2. Anchored strictly to the Phaser game canvas (via useHudScale left/top/width/height)
 *    so buttons and joystick never bleed into letterbox black bars.
 * 3. Uses toAppPoint(clientX, clientY) for correct coordinate mapping under
 *    the CSS 90° rotated layout.
 * 4. High-performance direct DOM transform for the knob on touchmove, bypassing
 *    React state reconciliation for 60/120fps stutter-free dragging.
 */

const JOYSTICK_BASE_PX = 140;
const JOYSTICK_KNOB_PX = 64;
const FIRE_BUTTON_PX = 96;
const DODGE_BUTTON_PX = 80;
const CLUSTER_GAP_PX = 14;
const CLUSTER_BOTTOM_PX = 24;
const CLUSTER_RIGHT_PX = 16;
const DEAD_ZONE = 0.12;
const DEFAULT_LEFT_PX = 36;
const DEFAULT_BOTTOM_PX = 36;

interface JoystickState {
    pointerId: number;
    centerX: number;
    centerY: number;
}

export const TouchControls: React.FC = () => {
    const tavernCleared = useGameStore((s) => s.tavernCleared);
    const [visible, setVisible] = useState<boolean>(false);
    const [joystickActive, setJoystickActive] = useState<boolean>(false);
    const [joystickPos, setJoystickPos] = useState<{ x: number; y: number }>({
        x: DEFAULT_LEFT_PX,
        y: 0,
    });

    const joystickRef = useRef<JoystickState | null>(null);
    const knobRef = useRef<HTMLDivElement>(null);
    const firingRef = useRef<boolean>(false);
    const dodgeRef = useRef<boolean>(false);
    const { scale, width, height, left, top } = useHudScale();

    useEffect(() => {
        const evaluate = (): void => setVisible(isMobileLike());
        evaluate();
        window.addEventListener('resize', evaluate);
        return () => window.removeEventListener('resize', evaluate);
    }, []);

    // During Tavern Selection (!tavernCleared), TouchControls must NOT render:
    // 1. Player has not chosen a character yet, so walking/shooting/dodging is inactive.
    // 2. Prevents the touch-joystick catch zone from capturing taps intended for character sprites.
    if (!visible || !tavernCleared) return null;

    const maxOffset = (JOYSTICK_BASE_PX - JOYSTICK_KNOB_PX) / 2;
    const clampOffset = (x: number, y: number) => {
        const len = Math.hypot(x, y);
        if (len === 0) return { x: 0, y: 0 };
        if (len <= maxOffset) return { x, y };
        return { x: (x / len) * maxOffset, y: (y / len) * maxOffset };
    };

    const layerW = width > 0 ? width / scale : 0;
    const layerH = height > 0 ? height / scale : 0;

    const defaultPos = {
        x: DEFAULT_LEFT_PX,
        y: Math.max(8, layerH - JOYSTICK_BASE_PX - DEFAULT_BOTTOM_PX),
    };

    const currentPos = joystickActive ? joystickPos : defaultPos;

    const handleJoystickStart = (e: React.PointerEvent<HTMLDivElement>): void => {
        // App coordinates (handles CSS 90° rotation):
        const appP = toAppPoint(e.clientX, e.clientY);
        // Canvas-relative coordinates inside scaled HUD layer:
        const layerX = (appP.x - left) / scale;
        const layerY = (appP.y - top) / scale;

        // Right half is reserved for the FIRE/DODGE cluster — ignore taps there
        if (layerX > layerW / 2) return;

        const radius = JOYSTICK_BASE_PX / 2;
        const cx = Math.max(8, Math.min(layerW / 2 - JOYSTICK_BASE_PX - 8, layerX - radius));
        const cy = Math.max(8, Math.min(layerH - JOYSTICK_BASE_PX - 8, layerY - radius));

        joystickRef.current = {
            pointerId: e.pointerId,
            centerX: layerX,
            centerY: layerY,
        };
        setJoystickPos({ x: cx, y: cy });
        setJoystickActive(true);
        if (knobRef.current) {
            knobRef.current.style.transform = 'translate3d(0px, 0px, 0px)';
        }
        try {
            e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
            /* ignore */
        }
    };

    const handleJoystickMove = (e: React.PointerEvent<HTMLDivElement>): void => {
        const js = joystickRef.current;
        if (!js || js.pointerId !== e.pointerId) return;

        const appP = toAppPoint(e.clientX, e.clientY);
        const layerX = (appP.x - left) / scale;
        const layerY = (appP.y - top) / scale;

        const dx = layerX - js.centerX;
        const dy = layerY - js.centerY;

        const clamped = clampOffset(dx, dy);

        // High-performance direct DOM transform (bypasses React state reconciliation on touchmove)
        if (knobRef.current) {
            knobRef.current.style.transform = `translate3d(${clamped.x}px, ${clamped.y}px, 0px)`;
        }

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
        if (knobRef.current) {
            knobRef.current.style.transform = 'translate3d(0px, 0px, 0px)';
        }
        setJoystickActive(false);
        EventBus.emit('mobile:move', null);
    };

    const shootDown = (e: React.PointerEvent<HTMLButtonElement>): void => {
        e.preventDefault();
        firingRef.current = true;
        EventBus.emit('mobile:firing', true);
        try {
            (e.target as Element).setPointerCapture(e.pointerId);
        } catch {
            /* ignore */
        }
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
        try {
            (e.target as Element).setPointerCapture(e.pointerId);
        } catch {
            /* ignore */
        }
    };
    const dodgeUp = (e: React.PointerEvent<HTMLButtonElement>): void => {
        e.preventDefault();
        dodgeRef.current = false;
        EventBus.emit('mobile:dodge', false);
    };

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

    const style: React.CSSProperties =
        width > 0
            ? {
                  position: 'absolute',
                  left: `${left}px`,
                  top: `${top}px`,
                  width: `${width / scale}px`,
                  height: `${height / scale}px`,
                  transform: `scale(${scale})`,
                  transformOrigin: 'top left',
              }
            : { position: 'absolute', inset: 0 };

    return (
        <div
            className="z-30 pointer-events-none select-none touch-none overflow-hidden"
            style={style}
        >
            {/* Left-half catch zone */}
            <div
                className="absolute pointer-events-auto"
                style={{
                    left: 0,
                    top: 0,
                    width: layerW / 2,
                    height: layerH,
                    touchAction: 'none',
                }}
                onPointerDown={handleJoystickStart}
                onPointerMove={handleJoystickMove}
                onPointerUp={handleJoystickEnd}
                onPointerCancel={handleJoystickEnd}
                data-testid="touch-joystick-zone"
            />

            {/* Virtual joystick — resting at bottom-left, responsive under thumb when active */}
            <div
                className={`absolute pointer-events-none transition-opacity duration-150 ${
                    joystickActive ? 'opacity-90' : 'opacity-40'
                }`}
                style={{
                    left: currentPos.x,
                    top: currentPos.y,
                    width: JOYSTICK_BASE_PX,
                    height: JOYSTICK_BASE_PX,
                }}
                data-testid="touch-joystick"
            >
                <div
                    className="absolute inset-0 rounded-full border-2 border-amber-400/60 bg-stone-950/40 backdrop-blur-sm"
                    style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.5)' }}
                />
                <div
                    ref={knobRef}
                    className="absolute rounded-full bg-amber-400 border-2 border-amber-200 will-change-transform"
                    style={{
                        width: JOYSTICK_KNOB_PX,
                        height: JOYSTICK_KNOB_PX,
                        left: JOYSTICK_BASE_PX / 2 - JOYSTICK_KNOB_PX / 2,
                        top: JOYSTICK_BASE_PX / 2 - JOYSTICK_KNOB_PX / 2,
                        transform: 'translate3d(0px, 0px, 0px)',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                    }}
                />
            </div>

            {/* DODGE */}
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

            {/* FIRE */}
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
