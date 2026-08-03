/**
 * src/lib/dev/cheats.ts
 * --------------------------------------------------------------------------
 * Developer cheat toggles — local-only debug aids hidden from production.
 *
 * Two pieces of state right now:
 *   - infiniteHp   → cap incoming damage (toggled in characters/logic.ts)
 *   - muted        → set scene.sound.volume to 0 (audio controller)
 *
 * Storage: localStorage key `dev.cheats` (JSON).
 * Notification: EventBus event `dev:cheat:<key>` payload `{ key, value }`.
 *
 * Production safety: callers should gate UI on `isDev()` so the panel
 * never renders in a built bundle. The state still reads / writes
 * whatever's in localStorage regardless of dev mode (cheap; harm is
 * zero — no handler is wired up in prod builds).
 *
 * Pure module — no React, no Phaser. UI lives in
 * `src/editor/cheat-panel.tsx`.
 */

import { EventBus } from '@/lib/events/bus';

const STORAGE_KEY = 'dev.cheats';

export type CheatKey = 'infiniteHp' | 'muted' | 'oneHitKill';

export interface Cheats {
    infiniteHp: boolean;
    muted: boolean;
    oneHitKill: boolean;
}

export const DEFAULT_CHEATS: Cheats = {
    infiniteHp: false,
    muted: false,
    oneHitKill: false,
};

/** Local hostnames that count as dev — prod hosts never match. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * True when running in Vite dev AND the page is hosted on a local
 * hostname. Both checks required: prod builds force `viteDev=false`,
 * and non-local hostnames (preview deploys, etc.) fail the hostname
 * check even in vite dev.
 *
 * Tests pass `opts` to inject values; runtime reads `import.meta.env.DEV`
 * and `window.location.hostname`.
 */
export function isDev(opts?: { viteDev?: boolean; hostname?: string }): boolean {
    const viteDev = opts?.viteDev ?? (import.meta.env as { DEV?: boolean }).DEV === true;
    const hostname =
        opts?.hostname ?? (typeof window !== 'undefined' ? window.location.hostname : '');
    return viteDev && LOCAL_HOSTS.has(hostname);
}

function isBool(v: unknown): v is boolean {
    return typeof v === 'boolean';
}

/** Read the current cheat state from storage; falls back to defaults. */
export function loadCheats(storage: Storage = localStorage): Cheats {
    try {
        const raw = storage.getItem(STORAGE_KEY);
        if (!raw) return { ...DEFAULT_CHEATS };
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed !== 'object' || parsed === null) {
            return { ...DEFAULT_CHEATS };
        }
        const partial = parsed as Partial<Cheats>;
        return {
            infiniteHp: isBool(partial.infiniteHp) ? partial.infiniteHp : DEFAULT_CHEATS.infiniteHp,
            muted: isBool(partial.muted) ? partial.muted : DEFAULT_CHEATS.muted,
            oneHitKill: isBool(partial.oneHitKill) ? partial.oneHitKill : DEFAULT_CHEATS.oneHitKill,
        };
    } catch {
        return { ...DEFAULT_CHEATS };
    }
}

/** Persist the full cheat state to storage. */
export function saveCheats(state: Cheats, storage: Storage = localStorage): void {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/** Sync getter — defaults unless overridden. Pass a storage for tests. */
export function getCheats(storage: Storage = localStorage): Cheats {
    return loadCheats(storage);
}

/**
 * Update one cheat flag, persist the new state, and emit
 * `dev:cheat:<key>` so subscribers (AudioController, Character) can
 * react without coupling to React.
 */
export function applyCheat(key: CheatKey, value: boolean, storage: Storage = localStorage): void {
    const next: Cheats = { ...loadCheats(storage), [key]: value };
    saveCheats(next, storage);
    EventBus.emit(`dev:cheat:${key}`, { key, value });
}
