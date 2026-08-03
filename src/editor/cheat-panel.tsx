/**
 * src/editor/cheat-panel.tsx
 * --------------------------------------------------------------------------
 * Developer cheat panel — local-only debug aids hidden from production.
 *
 * Mounted inline in the editor sidebar (just above the outer Save).
 * Returns `null` outside dev (`isDev()` returns false), so it's a no-op
 * in production bundles — the sidebar simply doesn't show this row.
 *
 * State lives in localStorage (`dev.cheats`); subscribers (audio +
 * character) listen via EventBus (`dev:cheat:<key>`). See
 * `src/lib/dev/cheats.ts`.
 */

import { useCallback, useEffect, useState } from 'react';
import { Heart, Volume2, VolumeX, Wrench, Zap } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { applyCheat, DEFAULT_CHEATS, getCheats, isDev, type Cheats } from '@/lib/dev/cheats';

export function CheatPanel() {
    if (!isDev()) return null;
    return <CheatPanelInner />;
}

function CheatPanelInner() {
    const [state, setState] = useState<Cheats>(() => getCheats());

    // Re-sync if anything else (a different tab, manual localStorage edit)
    // changes the storage key while the panel is mounted.
    useEffect(() => {
        const onStorage = (e: StorageEvent) => {
            if (e.key === 'dev.cheats') setState(getCheats());
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, []);

    const toggleInfiniteHp = useCallback(() => {
        const next = !state.infiniteHp;
        setState((s) => ({ ...s, infiniteHp: next }));
        applyCheat('infiniteHp', next);
    }, [state.infiniteHp]);

    const toggleOneHitKill = useCallback(() => {
        const next = !state.oneHitKill;
        setState((s) => ({ ...s, oneHitKill: next }));
        applyCheat('oneHitKill', next);
    }, [state.oneHitKill]);

    const toggleMuted = useCallback(() => {
        const next = !state.muted;
        setState((s) => ({ ...s, muted: next }));
        applyCheat('muted', next);
    }, [state.muted]);

    return (
        <div
            data-testid="cheat-panel"
            className="flex items-center justify-between gap-1 border-t border-neutral-800 px-3 py-2"
        >
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-neutral-500">
                <Wrench className="size-3" />
                Dev cheats
            </div>
            <div className="flex items-center gap-1">
                <CheatToggle
                    active={state.infiniteHp}
                    onClick={toggleInfiniteHp}
                    onIcon={<Heart className="size-3.5 fill-current" />}
                    offIcon={<Heart className="size-3.5" />}
                    shortLabel="HP"
                    label={state.infiniteHp ? 'Infinite HP: ON' : 'Infinite HP: OFF'}
                    hint="999,999,999 HP; ignores damage"
                />
                <CheatToggle
                    active={state.oneHitKill}
                    onClick={toggleOneHitKill}
                    onIcon={<Zap className="size-3.5 fill-current" />}
                    offIcon={<Zap className="size-3.5" />}
                    shortLabel="1-Hit"
                    label={state.oneHitKill ? 'One-Hit Kill: ON' : 'One-Hit Kill: OFF'}
                    hint="Inflict 999,999 damage on monster hits"
                />
                <CheatToggle
                    active={state.muted}
                    onClick={toggleMuted}
                    onIcon={<VolumeX className="size-3.5" />}
                    offIcon={<Volume2 className="size-3.5" />}
                    shortLabel="Mute"
                    label={state.muted ? 'Mute: ON' : 'Mute: OFF'}
                    hint="Set Phaser sound.volume to 0"
                />
            </div>
        </div>
    );
}

function CheatToggle({
    active,
    onClick,
    onIcon,
    offIcon,
    shortLabel,
    label,
    hint,
}: {
    active: boolean;
    onClick: () => void;
    onIcon: React.ReactNode;
    offIcon: React.ReactNode;
    shortLabel: string;
    label: string;
    hint: string;
}) {
    return (
        <Button
            variant="outline"
            size="xs"
            onClick={onClick}
            aria-pressed={active}
            aria-label={label}
            title={`${label} — ${hint}`}
            className={
                active
                    ? 'gap-1 border-amber-400 bg-amber-500/20 px-2 text-amber-300 hover:bg-amber-500/30 hover:text-amber-200'
                    : 'gap-1 border-neutral-700 bg-neutral-950 px-2 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
            }
        >
            {active ? onIcon : offIcon}
            {shortLabel}
        </Button>
    );
}

// Exported for tests / debugging.
export const __TEST_ONLY__ = { DEFAULT_CHEATS };
