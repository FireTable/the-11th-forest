/**
 * src/game/audios/logic.ts
 * --------------------------------------------------------------------------
 * Audios module — entity/runtime + controller in one file.
 *
 *   - loadAudioAssets: queue every audio file on the scene's loader.
 *   - AudioController: subscribes to EventBus events `sfx:<id>`,
 *     `music:<id>`, `music:stop/pause/resume`. Each SFX spec id becomes a
 *     dedicated listener so other modules emit, never import.
 *   - Music is single-track, cross-scene: the music id + sound instance
 *     live in module-level globals so a scene swap doesn't restart the
 *     same BGM (a fresh AudioController adopts the running sound instead
 *     of spawning a duplicate).
 *
 * No direct imports of the audio module from gameplay code — every sound
 * is triggered by `EventBus.emit` (CLU rule 12: each module owns its own
 * concerns).
 */

import * as Phaser from 'phaser';

import {
    AUDIO_DEFAULT_FADE_MS,
    MUSIC_EVENT,
    MUSIC_PAUSE,
    MUSIC_RESUME,
    MUSIC_STOP,
    SFX_EVENT,
} from '@/lib/constants';
import { getCheats } from '@/lib/dev/cheats';
import { EventBus } from '@/lib/events/bus';
import type { MusicSpec, SfxSpec, SoundSpec } from '@/lib/audios';

import { SfxThrottle } from './throttle';
import { visibilityAction } from './visibility';

const audioKey = (spec: SoundSpec): string => {
    if (spec.kind === 'sfx') return `sfx:${spec.id}`;
    return `music:${spec.id}`;
};

const sourceUrl = (src: string): string => (src.startsWith('/') ? src : `/${src}`);

// ─── Music singleton ─────────────────────────────────────────────────────

/**
 * Module-level "what's playing right now" tracker. Survives scene
 * transitions: when a scene's AudioController is destroyed, the music
 * keeps playing; the next scene's controller adopts the same sound
 * instead of adding a new instance. Without this, two scenes that
 * share a BGM would stack their sounds on top of each other.
 */
let globalMusicId: string | null = null;
let globalMusicSound: Phaser.Sound.BaseSound | null = null;

/** Read-only peek used by tests / debug surfaces. */
export function getCurrentMusicId(): string | null {
    return globalMusicId;
}

// ─── Asset loading ──────────────────────────────────────────────────────

/**
 * Queue every audio file on the scene's loader. Call from `preload()` so
 * Phaser waits for the buffers before `create()` runs.
 */
export function loadAudioAssets(
    scene: Pick<Phaser.Scene, 'load'>,
    specs: Iterable<SoundSpec>,
): void {
    for (const spec of specs) {
        scene.load.audio(audioKey(spec), sourceUrl(spec.source));
    }
}

// ─── Controller ─────────────────────────────────────────────────────────

export class AudioController {
    private readonly scene: Phaser.Scene;
    private readonly sfxSpecs: Map<string, SfxSpec>;
    private readonly musicSpecs: Map<string, MusicSpec>;
    /** Local throttle + EventBus unsubscribers — destroyed on teardown.
     *  Music state itself lives in module-level globals so it survives
     *  scene transitions (see `globalMusicId` / `globalMusicSound`). */
    private readonly throttle = new SfxThrottle();
    private readonly unsubscribers: Array<() => void> = [];
    /** Music id deferred until Phaser unlocks the AudioContext (first
     *  user gesture). Cleared once played. */
    private pendingMusic: string | null = null;

    constructor(scene: Phaser.Scene, sfxSpecs: Iterable<SfxSpec>, musicSpecs: Iterable<MusicSpec>) {
        this.scene = scene;
        this.sfxSpecs = new Map();
        for (const s of sfxSpecs) this.sfxSpecs.set(s.id, s);
        this.musicSpecs = new Map();
        for (const m of musicSpecs) this.musicSpecs.set(m.id, m);

        // Honor the dev "Mute" cheat from localStorage so a refreshed
        // page (or a re-mount after dev toggled it earlier) starts silent.
        if (getCheats().muted) {
            this.scene.sound.volume = 0;
        }

        this.subscribe();

        // Browsers auto-suspend the AudioContext when the tab hides OR when
        // the window blurs (e.g. Cmd+Tab to another app on macOS — the
        // window stays visible but loses focus, so `visibilitychange`
        // never fires; only `blur` does). `pauseAll` alone is not enough:
        // gameplay scenes keep running their update loop, SFX requests
        // keep flowing into the audio engine, and the queued samples all
        // drain on resume — a short, distorted burst over the music /
        // ambient loops.
        //
        // `game.pause()` is the right hammer: it sets `game.isPaused = true`
        // and Phaser's Step returns early, so update/tween/timer/physics
        // all freeze — no new SFX are emitted while the tab is hidden.
        // We resume on tab return. No per-scene bookkeeping needed; the
        // death path uses `scene.scene.pause()` (independent of
        // `game.pause()`), so a dead LoadScene stays dead across a tab
        // hide/show. See src/game/audios/visibility.ts.
        const game = this.scene.game;
        let stoppedByUs = false;
        const stop = (): void => {
            if (stoppedByUs) return;
            stoppedByUs = true;
            this.scene.sound.pauseAll();
            if (!game.isPaused) game.pause();
        };
        const start = (): void => {
            if (!stoppedByUs) return;
            stoppedByUs = false;
            if (game.isPaused) game.resume();
            this.scene.sound.resumeAll();
        };
        const onVisibility = () => {
            if (visibilityAction(document.hidden) === 'pause') stop();
            else start();
        };
        // Window blur covers Cmd+Tab to another app: the page stays
        // visible but loses focus, so `visibilitychange` doesn't fire.
        const onBlur = () => stop();
        const onFocus = () => start();
        document.addEventListener('visibilitychange', onVisibility);
        window.addEventListener('blur', onBlur);
        window.addEventListener('focus', onFocus);
        this.unsubscribers.push(() => {
            document.removeEventListener('visibilitychange', onVisibility);
            window.removeEventListener('blur', onBlur);
            window.removeEventListener('focus', onFocus);
        });
    }

    /**
     * Play a registered SFX by id. Spawns a new sound instance —
     * polyphonic — unless a throttle blocks it.
     *
     * @param id    SFX spec id
     * @param opts.key         throttle bucket. Defaults to `id` (one
     *                         global slot per SFX). Emitters pass
     *                         `` `monster:${id}` `` / `` `weapon:${id}` ``
     *                         etc. so different entities don't share a
     *                         throttle window.
     * @param opts.throttleMs  optional gap in ms between plays; omit to
     *                         disable throttling for this call.
     */
    playSfx(id: string, opts: { key?: string; throttleMs?: number } = {}): void {
        const spec = this.sfxSpecs.get(id);
        if (!spec) return;
        const throttleKey = opts.key ?? id;
        if (!this.throttle.allow(throttleKey, this.scene.time.now, opts.throttleMs)) {
            return;
        }
        const aKey = audioKey(spec);
        if (!this.scene.cache.audio.exists(aKey)) {
            // ponytail: fail silent — a missing audio file shouldn't break gameplay.
            return;
        }
        const sound = this.scene.sound.add(aKey, {
            volume: spec.volume,
            rate: spec.rate,
            loop: spec.loop,
        });
        sound.play();
        if (!spec.loop) {
            sound.once(Phaser.Sound.Events.COMPLETE, () => sound.destroy());
        }
    }

    /** Cross-fade to a registered music track. No-op if unknown.
     *
     *  Singleton-aware: if the requested id matches the music that's
     *  already playing globally (across scene transitions), this just
     *  adopts the running sound instead of spawning a duplicate. */
    playMusic(id: string): void {
        const spec = this.musicSpecs.get(id);
        if (!spec) return;
        const key = audioKey(spec);
        if (!this.scene.cache.audio.exists(key)) return;

        // Same BGM already playing globally (e.g. the previous scene
        // set it and the new scene is requesting the same id) — adopt
        // ownership, don't restart. Otherwise two sounds stack on
        // top of each other during the cross-scene transition.
        if (globalMusicId === id && globalMusicSound?.isPlaying) {
            return;
        }

        // Browser autoplay policy keeps AudioContext suspended until the
        // first user gesture. If we play now, the WebAudio source is
        // scheduled but produces no audio — and `AudioBufferSourceNode`
        // is one-shot, so resuming the context later won't replay it.
        // Defer until Phaser emits UNLOCKED (fires after the user's
        // first click/keypress unlocks the context).
        if (this.scene.sound.locked) {
            this.pendingMusic = id;
            return;
        }

        // Different music (or none playing): cross-fade global old → new.
        const oldSound = globalMusicSound;
        const oldSpec = globalMusicId ? this.musicSpecs.get(globalMusicId) : null;

        const next = this.scene.sound.add(key, {
            volume: 0,
            rate: 1,
            loop: true,
        });
        next.play();
        if (spec.fadeIn > 0) {
            this.scene.tweens.add({
                targets: next,
                volume: spec.volume,
                duration: spec.fadeIn,
                ease: 'Linear',
            });
        } else {
            next.setVolume(spec.volume);
        }
        if (oldSound && oldSpec) {
            this.scene.tweens.add({
                targets: oldSound,
                volume: 0,
                duration: oldSpec.fadeOut || AUDIO_DEFAULT_FADE_MS,
                ease: 'Linear',
                onComplete: () => oldSound.destroy(),
            });
        }
        globalMusicId = id;
        globalMusicSound = next;
    }

    /** Stop the current music track with its fadeOut (or default).
     *  Operates on the global current music — whichever scene owns it. */
    stopMusic(): void {
        const sound = globalMusicSound;
        if (!sound) return;
        const spec = globalMusicId ? this.musicSpecs.get(globalMusicId) : null;
        const fadeOut = spec?.fadeOut ?? AUDIO_DEFAULT_FADE_MS;
        globalMusicId = null;
        globalMusicSound = null;
        this.scene.tweens.add({
            targets: sound,
            volume: 0,
            duration: fadeOut,
            ease: 'Linear',
            onComplete: () => sound.destroy(),
        });
    }

    pauseMusic(): void {
        globalMusicSound?.pause();
    }

    resumeMusic(): void {
        globalMusicSound?.resume();
    }

    setSfxVolume(v: number): void {
        this.scene.sound.volume = Math.max(0, Math.min(1, v));
    }

    setMusicVolume(v: number): void {
        this.scene.sound.volume = Math.max(0, Math.min(1, v));
    }

    destroy(): void {
        for (const u of this.unsubscribers) u();
        this.unsubscribers.length = 0;
        // Do NOT destroy globalMusicSound here — it's the singleton
        // BGM that survives scene transitions. The next scene's
        // AudioController will adopt it via playMusic's same-id branch.
    }

    // ─── internals ──────────────────────────────────────────────────────

    private subscribe(): void {
        for (const id of this.sfxSpecs.keys()) {
            const event = SFX_EVENT(id);
            const handler = (payload?: { key?: string; throttleMs?: number }) =>
                this.playSfx(id, payload ?? {});
            EventBus.on(event, handler);
            this.unsubscribers.push(() => EventBus.removeListener(event, handler));
        }
        for (const id of this.musicSpecs.keys()) {
            const event = MUSIC_EVENT(id);
            const handler = () => this.playMusic(id);
            EventBus.on(event, handler);
            this.unsubscribers.push(() => EventBus.removeListener(event, handler));
        }
        EventBus.on(MUSIC_STOP, () => this.stopMusic());
        EventBus.on(MUSIC_PAUSE, () => this.pauseMusic());
        EventBus.on(MUSIC_RESUME, () => this.resumeMusic());
        this.unsubscribers.push(() => EventBus.removeListener(MUSIC_STOP));
        this.unsubscribers.push(() => EventBus.removeListener(MUSIC_PAUSE));
        this.unsubscribers.push(() => EventBus.removeListener(MUSIC_RESUME));

        // Dev cheat — Mute toggle flips Phaser's master sound volume.
        const muteHandler = (payload?: { value?: boolean }) => {
            this.scene.sound.volume = payload?.value ? 0 : 1;
        };
        EventBus.on('dev:cheat:muted', muteHandler);
        this.unsubscribers.push(() => EventBus.removeListener('dev:cheat:muted', muteHandler));

        // Browser autoplay policy: AudioContext is suspended until the
        // first user gesture. Phaser emits `UNLOCKED` once the context
        // resumes — that's when we play the music that was queued by
        // `playMusic` while `sound.locked` was true.
        const unlockedHandler = () => {
            if (this.pendingMusic !== null) {
                const id = this.pendingMusic;
                this.pendingMusic = null;
                this.playMusic(id);
            }
        };
        this.scene.sound.once(Phaser.Sound.Events.UNLOCKED, unlockedHandler);
        this.unsubscribers.push(() =>
            this.scene.sound.off(Phaser.Sound.Events.UNLOCKED, unlockedHandler),
        );
    }
}
