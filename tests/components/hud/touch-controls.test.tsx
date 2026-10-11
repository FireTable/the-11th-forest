// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { TouchControls } from '@/components/hud/touch-controls';
import { EventBus } from '@/lib/events/bus';
import * as mobileModule from '@/lib/mobile';
import { useGameStore } from '@/store/game-store';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('TouchControls', () => {
    let container: HTMLDivElement;
    let root: any;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
        useGameStore.setState({ tavernCleared: true });
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
        EventBus.removeAllListeners();
        vi.restoreAllMocks();
    });

    it('renders null on desktop (not mobile-like)', () => {
        vi.spyOn(mobileModule, 'isMobileLike').mockReturnValue(false);

        act(() => {
            root.render(<TouchControls />);
        });

        expect(container.firstChild).toBeNull();
    });

    it('renders null during tavern character selection (!tavernCleared) to prevent touch interception', () => {
        vi.spyOn(mobileModule, 'isMobileLike').mockReturnValue(true);
        useGameStore.setState({ tavernCleared: false });

        act(() => {
            root.render(<TouchControls />);
        });

        expect(container.firstChild).toBeNull();
    });

    it('renders joystick and action buttons when mobile-like and tavernCleared is true', () => {
        vi.spyOn(mobileModule, 'isMobileLike').mockReturnValue(true);
        useGameStore.setState({ tavernCleared: true });

        act(() => {
            root.render(<TouchControls />);
        });

        expect(container.querySelector('[data-testid="touch-joystick-zone"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="touch-joystick"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="touch-dodge"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="touch-shoot"]')).not.toBeNull();
    });

    it('emits mobile:move events when joystick zone is touched and dragged', () => {
        vi.spyOn(mobileModule, 'isMobileLike').mockReturnValue(true);
        useGameStore.setState({ tavernCleared: true });

        const moveSpy = vi.fn();
        EventBus.on('mobile:move', moveSpy);

        act(() => {
            root.render(<TouchControls />);
        });

        const zone = container.querySelector('[data-testid="touch-joystick-zone"]') as HTMLDivElement;
        expect(zone).not.toBeNull();

        // 1. Pointer down on left half (e.g. clientX: 100, clientY: 300)
        act(() => {
            zone.dispatchEvent(
                new PointerEvent('pointerdown', {
                    bubbles: true,
                    clientX: 100,
                    clientY: 300,
                    pointerId: 1,
                }),
            );
        });

        // 2. Drag rightwards (clientX: 140, clientY: 300)
        act(() => {
            zone.dispatchEvent(
                new PointerEvent('pointermove', {
                    bubbles: true,
                    clientX: 140,
                    clientY: 300,
                    pointerId: 1,
                }),
            );
        });

        expect(moveSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                vx: expect.any(Number),
                vy: expect.any(Number),
            }),
        );
        expect(moveSpy.mock.calls.at(-1)?.[0]?.vx).toBeGreaterThan(0);

        // 3. Pointer up -> resets to null
        act(() => {
            zone.dispatchEvent(
                new PointerEvent('pointerup', {
                    bubbles: true,
                    clientX: 140,
                    clientY: 300,
                    pointerId: 1,
                }),
            );
        });

        expect(moveSpy).toHaveBeenLastCalledWith(null);
    });

    it('emits mobile:firing and mobile:dodge on action buttons', () => {
        vi.spyOn(mobileModule, 'isMobileLike').mockReturnValue(true);
        useGameStore.setState({ tavernCleared: true });

        const firingSpy = vi.fn();
        const dodgeSpy = vi.fn();
        EventBus.on('mobile:firing', firingSpy);
        EventBus.on('mobile:dodge', dodgeSpy);

        act(() => {
            root.render(<TouchControls />);
        });

        const shootBtn = container.querySelector('[data-testid="touch-shoot"]') as HTMLButtonElement;
        const dodgeBtn = container.querySelector('[data-testid="touch-dodge"]') as HTMLButtonElement;

        // Shoot down & up
        act(() => {
            shootBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 2 }));
        });
        expect(firingSpy).toHaveBeenCalledWith(true);

        act(() => {
            shootBtn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 2 }));
        });
        expect(firingSpy).toHaveBeenCalledWith(false);

        // Dodge down & up
        act(() => {
            dodgeBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 3 }));
        });
        expect(dodgeSpy).toHaveBeenCalledWith(true);

        act(() => {
            dodgeBtn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 3 }));
        });
        expect(dodgeSpy).toHaveBeenCalledWith(false);
    });
});
