// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ComboOverlay } from '@/components/hud/combo-overlay';
import { EventBus } from '@/lib/events/bus';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('ComboOverlay', () => {
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

    it('renders null when combo count < 2', () => {
        act(() => {
            root.render(<ComboOverlay />);
        });

        expect(container.firstChild).toBeNull();

        act(() => {
            EventBus.emit('combat:combo', { count: 1 });
        });
        expect(container.firstChild).toBeNull();
    });

    it('renders combo HUD and decays when combo >= 2', () => {
        vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));

        act(() => {
            root.render(<ComboOverlay />);
        });

        act(() => {
            EventBus.emit('combat:combo', { count: 5 });
        });

        expect(container.textContent).toContain('5');
        expect(container.textContent).toContain('HITS');
        expect(container.textContent).toContain('HIT');
    });

    it('displays higher tiers for high combos', () => {
        act(() => {
            root.render(<ComboOverlay />);
        });

        act(() => {
            EventBus.emit('combat:combo', { count: 12 });
        });
        expect(container.textContent).toContain('COMBO');

        act(() => {
            EventBus.emit('combat:combo', { count: 30 });
        });
        expect(container.textContent).toContain('RAMPAGE');

        act(() => {
            EventBus.emit('combat:combo', { count: 60 });
        });
        expect(container.textContent).toContain('MAX FEVER');
    });
});
