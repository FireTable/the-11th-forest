import { mapRealProgress, nextProgress } from '@/lib/boot-loading/layout';

/** Where the fake CSS fill stood when real progress took over (-1 = not taken over yet). */
let f0 = -1;
/** Last value handed to the bar — monotonic, because Phaser restarts at 0 for every scene. */
let shown = 0;

/**
 * Feed Phaser loader progress (0..1) into the `#boot` bar. Called once per `load.progress`
 * event from the LoadScene preload. No-ops once `#boot` is gone or has started fading, so the
 * later scene switches (which emit their own progress) cost one DOM lookup and nothing else.
 */
export function setBootProgress(r: number): void {
    const boot = document.getElementById('boot');
    if (!boot || boot.classList.contains('boot-done')) return;
    if (f0 < 0) {
        const fill = boot.querySelector('.progress-bar');
        const m = fill ? getComputedStyle(fill, '::after').transform : 'none';
        // 'matrix(a, b, c, d, e, f)' → a is scaleX; 'none' → nothing has been drawn yet.
        const a = m.startsWith('matrix(') ? parseFloat(m.slice(7)) : 0;
        f0 = Number.isFinite(a) ? Math.min(1, Math.max(0, a)) : 0;
        shown = f0;
        // Hands the fill over from the CSS animation to the --boot-p custom property.
        boot.classList.add('boot-real');
    }
    shown = nextProgress(shown, mapRealProgress(f0, r));
    boot.style.setProperty('--boot-p', shown.toFixed(4));
}
