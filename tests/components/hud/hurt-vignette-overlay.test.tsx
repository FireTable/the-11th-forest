// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { HurtVignetteOverlay } from '@/components/hud/hurt-vignette-overlay';
import { EventBus } from '@/lib/events/bus';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('HurtVignetteOverlay', () => {
    let container: HTMLDivElement;
    let root: any;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
        EventBus.removeAllListeners();
        vi.restoreAllMocks();
    });

    it('renders initially hidden', () => {
        act(() => {
            root.render(<HurtVignetteOverlay />);
        });

        const overlay = container.querySelector('[data-testid="hurt-vignette-overlay"]') as HTMLDivElement;
        expect(overlay).not.toBeNull();
        expect(overlay.style.display).toBe('none');
        expect(overlay.style.opacity).toBe('0');
    });

    it('flashes to opacity 1 and display block when combat:player-hurt is emitted', () => {
        vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));

        act(() => {
            root.render(<HurtVignetteOverlay />);
        });

        const overlay = container.querySelector('[data-testid="hurt-vignette-overlay"]') as HTMLDivElement;
        expect(overlay.style.display).toBe('none');

        act(() => {
            EventBus.emit('combat:player-hurt', { damage: 15 });
        });

        expect(overlay.style.display).toBe('block');
        expect(overlay.style.opacity).toBe('0.5');
        expect(window.requestAnimationFrame).toHaveBeenCalled();
    });
});
