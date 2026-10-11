// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { TavernHud } from '@/components/hud/tavern-hud';
import { EventBus } from '@/lib/events/bus';
import * as mobileModule from '@/lib/mobile';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('TavernHud', () => {
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

    it('renders null when focus is null', () => {
        act(() => {
            root.render(<TavernHud />);
        });
        expect(container.firstChild).toBeNull();
    });

    it('renders character info on desktop during selection phase', () => {
        vi.spyOn(mobileModule, 'isMobileLike').mockReturnValue(false);

        act(() => {
            root.render(<TavernHud />);
        });

        act(() => {
            EventBus.emit('tavern-focus', {
                name: 'Otaku',
                hp: 100,
                sp: 60,
                moveSpeed: 4,
                spRegenMs: 5000,
                description: 'A bookish shut-in',
                phase: 'selection',
                weaponCount: 0,
                weaponMax: 4,
                viewportX: 100,
                viewportY: 200,
            });
        });

        expect(container.textContent).toContain('Otaku');
        expect(container.textContent).toContain('A bookish shut-in');
        expect(container.textContent).toContain('HP');
    });

    it('hides character selection intro card on mobile viewports', () => {
        vi.spyOn(mobileModule, 'isMobileLike').mockReturnValue(true);

        act(() => {
            root.render(<TavernHud />);
        });

        act(() => {
            EventBus.emit('tavern-focus', {
                name: 'Otaku',
                hp: 100,
                sp: 60,
                moveSpeed: 4,
                spRegenMs: 5000,
                description: 'A bookish shut-in',
                phase: 'selection',
                weaponCount: 0,
                weaponMax: 4,
                viewportX: 100,
                viewportY: 200,
            });
        });

        expect(container.firstChild).toBeNull();
    });

    it('still renders weapon slots on mobile during pickup phase', () => {
        vi.spyOn(mobileModule, 'isMobileLike').mockReturnValue(true);

        act(() => {
            root.render(<TavernHud />);
        });

        act(() => {
            EventBus.emit('tavern-focus', {
                name: 'Otaku',
                hp: 100,
                sp: 60,
                moveSpeed: 4,
                spRegenMs: 5000,
                phase: 'pickup',
                weaponCount: 1,
                weaponMax: 3,
            });
        });

        expect(container.textContent).toContain('Weapon Slots');
        expect(container.textContent).toContain('Stage 1');
    });
});
