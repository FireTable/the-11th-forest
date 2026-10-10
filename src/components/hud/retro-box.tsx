/**
 * src/components/hud/retro-box.tsx
 * --------------------------------------------------------------------------
 * The arcade-chrome motif every HUD panel shares: a dark translucent box
 * with an amber inner rule and four amber pixels at the corners.
 */

/**
 * Four amber corner pixels, sitting 3px outside the border so they read
 * as a pixel-art frame. The parent must be `relative` and must NOT clip
 * its overflow — scope any `overflow-hidden` to an inner wrapper instead.
 *
 * `hideBottom` drops the two bottom corners — useful when the panel has
 * a downward indicator (e.g. TavernHud's selection arrow) so the
 * corner pixels don't compete with it for the same visual slot.
 */
export function CornerPixels({ hideBottom = false }: { hideBottom?: boolean }) {
    const corners = hideBottom
        ? ['-top-[3px] -left-[3px]', '-top-[3px] -right-[3px]']
        : [
              '-top-[3px] -left-[3px]',
              '-top-[3px] -right-[3px]',
              '-bottom-[3px] -left-[3px]',
              '-bottom-[3px] -right-[3px]',
          ];
    return (
        <>
            {corners.map((c) => (
                <span
                    key={c}
                    className={`pointer-events-none absolute z-10 h-[3px] w-[3px] bg-amber-400 ${c}`}
                />
            ))}
        </>
    );
}

/** Panel skin — pair with `<CornerPixels />` on a `relative` parent. */
export const RETRO_BOX =
    'bg-stone-950/40 border-2 border-stone-900/80 shadow-[0_4px_16px_rgba(0,0,0,0.5),inset_0_0_0_1px_rgba(245,158,11,0.25)] backdrop-blur-sm';
