/**
 * src/game/audios/visibility.ts
 * --------------------------------------------------------------------------
 * Pure helper for the music-on-hidden-tab glitch.
 *
 * Browsers auto-suspend the AudioContext when the tab goes hidden. If
 * the audio engine isn't paused in lockstep, samples keep accumulating
 * into the buffer (some browsers) and all play at once when the tab
 * becomes visible again — the user hears a short, distorted "explosion"
 * of overlapping music + SFX.
 *
 * `visibilityAction` is the decision: hidden → pause, visible → resume.
 * Kept pure so the AudioController wires it without needing a DOM mock
 * in tests.
 */

export type VisibilityAction = 'pause' | 'resume';

export function visibilityAction(isHidden: boolean): VisibilityAction {
    return isHidden ? 'pause' : 'resume';
}