/**
 * src/game/audios/logic.ts
 * --------------------------------------------------------------------------
 * Audios module — entity/runtime + controller in one file.
 *
 *   - loadAudioAssets: queue every audio file on the scene's loader.
 *   - AudioController: subscribes to EventBus events `sfx:<id>`,
 *     `music:<id>`, `music:stop/pause/resume`. Each SFX spec id becomes a
 *     dedicated listener so other modules emit, never import.
 *   - Music is single-track: starting a new track cross-fades the old one.
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

const audioKey = (spec: SoundSpec): string => {
    if (spec.kind === 'sfx') return `sfx:${spec.id}`;
    return `music:${spec.id}`;
};

const sourceUrl = (src: string): string => (src.startsWith('/') ? src : `/${src}`);

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
    private currentMusic?: Phaser.Sound.BaseSound;
    private currentMusicSpec?: MusicSpec;
    private readonly throttle = new SfxThrottle();
    private readonly unsubscribers: Array<() => void> = [];

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

    /** Cross-fade to a registered music track. No-op if unknown. */
    playMusic(id: string): void {
        const spec = this.musicSpecs.get(id);
        if (!spec) return;
        const key = audioKey(spec);
        if (!this.scene.cache.audio.exists(key)) return;
        if (this.currentMusicSpec?.id === id && this.currentMusic?.isPlaying) return;

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
        const fadedOut = this.currentMusic;
        const oldSpecs = this.currentMusicSpec;
        if (fadedOut && oldSpecs) {
            this.scene.tweens.add({
                targets: fadedOut,
                volume: 0,
                duration: oldSpecs.fadeOut || AUDIO_DEFAULT_FADE_MS,
                ease: 'Linear',
                onComplete: () => fadedOut.destroy(),
            });
        }
        this.currentMusic = next;
        this.currentMusicSpec = spec;
    }

    /** Stop the current music track with its fadeOut (or default). */
    stopMusic(): void {
        if (!this.currentMusic) return;
        const old = this.currentMusic;
        const fadeOut = this.currentMusicSpec?.fadeOut ?? AUDIO_DEFAULT_FADE_MS;
        this.currentMusic = undefined;
        this.currentMusicSpec = undefined;
        this.scene.tweens.add({
            targets: old,
            volume: 0,
            duration: fadeOut,
            ease: 'Linear',
            onComplete: () => old.destroy(),
        });
    }

    pauseMusic(): void {
        this.currentMusic?.pause();
    }

    resumeMusic(): void {
        this.currentMusic?.resume();
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
        this.currentMusic?.destroy();
        this.currentMusic = undefined;
        this.currentMusicSpec = undefined;
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
    }
}
