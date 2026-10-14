# Boot Loading Screen

The animated splash the player sees before the game appears. The static key art is placed by
`src/boot.ts` and revealed there, then a WebGL canvas fades in **over** it and takes over: a title
that floats and follows the mouse, mushroom
glow, swaying grass, characters breathing, and a warm glowing arch that brightens when loading
completes. A pixel-art runner walks the progress bar the whole time. The sky stays frozen
throughout, and there is not a single particle. If WebGL is unavailable the static image is the
whole experience — every effect is optional, none of them is load-bearing.

The art stays `visibility: hidden` until it is placed on purpose: the stylesheet's own centred
`object-fit: cover` is a **different rect** from the focal-point cover `placeArt()` writes (about
9 CSS px apart at 1280 wide), so painting the CSS one first costs a visible sideways jump
whenever the image decodes before the boot module does.

## Timeline

| #   | Moment             | What happens                                                                                             |
| --- | ------------------ | -------------------------------------------------------------------------------------------------------- |
| 1   | HTML paint         | `#boot` renders: the CSS progress bar, plus the static `<img id="boot-art">` still `visibility: hidden`. |
| 2   | `src/boot.ts` runs | Fits the art synchronously and reveals it, then loads the 7 images and builds the WebGL program.         |
| 3   | Canvas inserted    | Still `opacity: 0` — invisible underneath the static art, so nothing can flash.                          |
| 4   | 3rd frame drawn    | `opacity` flips to `1` once; `uK` starts ramping `0 → 1` over `RAMP_MS` (300 ms).                        |
| 5   | Loading            | `setBootProgress` drives the bar and the runner; effects animate; the arch glows.                        |
| 6   | `boot-done`        | Bar snaps to 100 %, the arch brightens to its peak (`ARCH_GLOW_MS` 400 ms), `#boot` fades over 450 ms.   |
| 7   | `#boot` removed    | ~400 ms after `boot-done` (`PhaserGame.tsx`). A `MutationObserver` notices and disposes the canvas.      |
| 8   | Dispose            | rAF cancelled, listeners removed, canvas removed from the DOM, WebGL context released.                   |

### First paint

Everything the player sees first is on screen before any JS runs, and nothing waits on a second
round of requests:

- The key art `<img>` is preloaded with `fetchpriority="high"`; the seven animated layers and masks
  are `<link rel="preload">`ed in `<head>` alongside it, so they are already cached when the
  splash script asks for them.
- `src/boot.ts` is an `async` module script, so it runs as soon as it arrives rather than after the
  rest of the page. Its tunables live in the dependency-free `src/lib/boot-loading/config.ts`
  (re-exported from `@/lib/constants`), so the splash never pulls in the game-wide constants.
- The runner's frame 0 is inlined in `index.html` as a 20×24 PNG data URI on `.pixel-runner`, so he
  stands on the bar from the first paint; the canvas `mountRunner` adds draws the same frame, and the inline image is removed as soon as the
  canvas has a context (the canvas is transparent, so leaving it would show a second runner).
  `tests/lib/boot-loading/runner-inline.test.ts` fails if the inline image and the sprite drift.

## Files

| File                                    | Role                                                                                |
| --------------------------------------- | ----------------------------------------------------------------------------------- |
| `index.html`                            | `#boot` markup + all splash CSS (scoped inside `#boot`), loads `/src/boot.ts`.      |
| `src/boot.ts`                           | Entry point: `void startBootLoading()`.                                             |
| `src/lib/boot-loading/layout.ts`        | Pure, DOM-free math: fit, DPR cap, progress, breath curve.                          |
| `src/lib/boot-loading/gl.ts`            | WebGL core: one program, 4 quads, textures, `draw(t, k, fx)`.                       |
| `src/lib/boot-loading/start.ts`         | DOM glue: measures the CSS layout, drives the canvas, rAF loop, lifecycle, dispose. |
| `src/lib/boot-loading/runner.ts`        | The bar runner: 20×24 pixel sprite data + the canvas that walks it.                 |
| `src/lib/boot-loading/progress.ts`      | `setBootProgress(r)` — Phaser loader progress into the `#boot` bar.                 |
| `src/lib/constants.ts`                  | `BOOT_LOADING` — every tunable in this document.                                    |
| `src/PhaserGame.tsx`                    | Adds `boot-done` and removes `#boot`.                                               |
| `src/game/scenes/scene.ts`              | One line in `preload()` feeds `load.on('progress')` into `setBootProgress`.         |
| `tests/lib/boot-loading/layout.test.ts` | Unit tests for every pure helper.                                                   |
| `tests/lib/boot-loading/runner.test.ts` | Unit tests for the runner sprite data and its walk cadence.                         |

## Assets

Served from `/assets/image/ui/loading/`. Coordinates are **art pixels** in the 1920×1072 key-art
space, origin top-left. Total ≈ 436 KB.

| File                             | Size (px)         | Placed at (x, y, w, h) art space | Content                                                                                                           |
| -------------------------------- | ----------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `forest-loading-key.webp`        | 1920×1072 RGB     | 0, 0, 1920, 1072                 | Full art. The static `<img>` and the no-WebGL fallback.                                                           |
| `forest-loading-bg.webp`         | 1920×1072 RGB     | 0, 0, 1920, 1072                 | Clean background plate behind the characters and title, incl. painted contact shadows.                            |
| `forest-loading-chars.webp`      | 970×495 RGBA      | 487, 481, 970, 495               | The 4 characters, keyed with transparent gaps between legs / arms / hair.                                         |
| `forest-loading-fg.webp`         | 1920×333 RGBA     | 0, 739, 1920, 333                | Fully transparent placeholder. Loaded and drawn (the code path stays live); draws nothing.                        |
| `forest-loading-title.webp`      | 809×317 RGBA      | 557, 162, 809, 317               | Pixel title, white fill + dark outline.                                                                           |
| `forest-loading-mask-bg.webp`    | 480×268 RGB (1/4) | 0, 0, 1920, 1072                 | **R** aurora/sky · **G** stars · **B** mushroom glow. Only **B** is read now — R and G died with the sky effects. |
| `forest-loading-mask-depth.webp` | 480×268 RGB (1/4) | 0, 0, 1920, 1072                 | **R** parallax depth (0 sky → 1 near ground) · **G** sway weight.                                                 |
| `forest-loading-mask-chars.webp` | 485×248 RGB (1/2) | 487, 481, 970, 495               | **R** belly · **G** ears + cat tail (tail = art y > 740 and x < 830) · **B** hair + bow.                          |
| `forest-loading-layout.json`     | —                 | —                                | Reference only. The numbers are copied into `layout.ts`; nothing fetches it.                                      |

Stacking order back→front is **bg, chars, fg, title**. Re-stacking the four layers reproduces the
key art, which is why the first WebGL frame matches the static image.

Masks are RGB with no alpha channel on purpose: an alpha mask uploaded with premultiply off can
lose RGB where alpha is 0 in some browsers.

## Rendering

- **One program, four quads.** A single unit quad (`TRIANGLE_STRIP`, 4 verts) is drawn once per
  layer with `uQuad` / `uRect` / `uMode` / `uOff`. Quads are padded in art px (`PAD`: bg 0, chars
  24, fg 0, title 8) so displaced pixels are never clipped.
- **One layout, owned by CSS.** `.forest-bg` fills the stage with `object-fit: cover` — that IS
  the layout, and nothing in JS moves it. `start.ts` MEASURES the box the browser produced, runs
  the same `coverFit` arithmetic on it, and hands the result to `uFit`. There is no second opinion
  to keep in step with the first, which is what used to make the `<img>` jump when JS took over.
  The `<img>` and the canvas are siblings inside `.forest-stage` and are never repositioned
  individually; an inline script in `index.html` snaps that wrapper to whole device pixels before
  the first paint, so both rasterise at the same phase.
- **The handover is an opacity flip.** The canvas draws invisibly over the `<img>` from the frame
  it mounts; once it has one, ONE task sets `canvas` opacity `1` and `<img>` opacity `0`. Until
  then `uK` is 0, so that frame is the image itself. `opacity`, never `visibility` — `visibility`
  drops the `<img>`'s raster, and in a production build the boot code lands with the whole game
  bundle, which would leave the splash blank for as long as that takes. `dispose()` (and any error
  path) puts both opacities back: the static image is the permanent fallback.

## Effects

**The sky is frozen.** No aurora, no stars, no shooting stars, no sky colour shift, no background
parallax — nothing in the shader touches a sky pixel. What is left is ground motion, the title and
the characters:

| Effect             | Mask channel            | Constant                           | Default     |
| ------------------ | ----------------------- | ---------------------------------- | ----------- |
| Grass / leaf sway  | mask-depth G × sky gate | `SWAY_PX`                          | 1.6         |
| Mushroom glow      | mask-bg B               | `MUSHROOM_GLOW`                    | 0.35        |
| Title float        | — (whole layer)         | `TITLE_FLOAT_PX`                   | 5           |
| Title parallax     | — (whole layer)         | `PARALLAX_TITLE`                   | −4          |
| Mouse smoothing    | —                       | `MOUSE_RATE`                       | 4 (1/s)     |
| Arch glow, loading | — (bg layer)            | `ARCH_GLOW_IDLE`                   | 0.25        |
| Arch glow at 100 % | — (bg layer)            | `ARCH_GLOW`                        | 0.55        |
| Arch glow ease     | —                       | `ARCH_GLOW_MS`                     | 400         |
| Arch glow colour   | —                       | `ARCH_GLOW_COLOR`                  | #FFD966     |
| Arch glow pulse    | —                       | `ARCH_PULSE_HZ` / `ARCH_PULSE_AMT` | 1.2 / ±30 % |

### Keeping the sky still

Three things had to change, because each of them reached into the sky:

- **Aurora, stars, shooting star** — removed outright: the `uAurPx` / `uAurSh` / `uStar` / `uShoot*`
  uniforms, the `AURORA_*` / `STAR_TWINKLE` / `SHOOT_*` constants and the `shootingStarAt` helper.
- **Background parallax** — removed (`PARALLAX_BG` / `uParBg`). It was depth-weighted, so it barely
  touched the sky; "barely" is not "not at all".
- **Grass sway** — kept, but multiplied by a **sky gate**: `smoothstep(SKY_GATE_LO, SKY_GATE_HI,
depthMask.r)`. The depth mask still carries a little sway up in the canopy (open sky sits at
  depth 0–27, foliage at 45+), so without the gate the leaves at the top of the frame would keep
  moving. With it, ~86 % of the sky's residual sway is frozen, ~96 % of the tree sway survives and
  the ground keeps 100 %. **Re-measure `SKY_GATE_LO` / `SKY_GATE_HI` if the masks are regenerated.**

The mushroom glow needs no gate: its mask channel is 0 everywhere above the forest floor.

**No particles.** There is no particle layer at all — no `.particles-container`, no `.spore`
elements, no `boot-spore-float` keyframes. The floating light dots are gone; nothing is added on
top of the art that could drift into the sky. What still moves is painted into the art (mushroom
glow, grass, the arch, the characters) plus the runner on the bar.

### The arch glow

The stone arch wears **warm yellow** (`ARCH_GLOW_COLOR` = `[1.0, 0.85, 0.4]` = `#FFD966`) the whole
time loading is on screen, breathing at ±30 % (`ARCH_PULSE_AMT`, one breath ≈ 5.2 s), and
brightening to its peak (`ARCH_GLOW` 0.55, up from `ARCH_GLOW_IDLE` 0.25) over `ARCH_GLOW_MS`
(400 ms) when the game is ready. It sits at art (1631, 469) with falloff radii 60×90 — on the
forest floor at the tree line, not in the sky — and it pulses during loading because `uDone` starts at the idle strength instead of 0.

It is a **tint, not an additive light**:

```glsl
vec3 warm = uArchColor * (0.35 + 0.65 * dot(c.rgb, vec3(0.299, 0.587, 0.114)));
c.rgb = mix(c.rgb, warm, clamp(lit, 0.0, 1.0));
```

The target colour is `uArchColor` scaled by the stone's own luminance, so it is always in gamut and
`mix` can never push a channel past it. Adding the glow instead clipped the bright arch stone
(≈212/206/160 raw) to white at peak; measured over the full pulse the stone now reads
≈214/201/137 — warm and clearly lit, nothing clipped. The colour lives in `src/lib/constants.ts`;
the tests assert it stays warm (red strongest, blue weakest) and that the pulse stays subtle.

On a coarse pointer every amplitude above is multiplied by `effectScale()` = `MOBILE_EFFECT_SCALE`
(0.6): phones get the same effects, softer and cheaper. Nothing is removed, only scaled.

## Breathing

All four chibis share **one** master curve, so they move as bodies instead of jittering:

- `breath(t, w)` in `layout.ts` is asymmetric — inhale 40 %, exhale 60 %, C1-smooth.
- `breathGLSL(w)` generates the GLSL `br()` **from the same `w`**, so the shader and the tests can
  never disagree about what a breath looks like (there is a test that re-implements the emitted
  GLSL literally and compares over a whole period).
- `CHAR_LAG_S = [0, 0.35, 0.7, 1.05]` staggers the four characters; parts lag further still
  (ears 0.15 s, tail 0.3 s, bunny ears 0.25 s, hair 0.4 s).

| Part       | Constant        | Default | Motion                                                         |
| ---------- | --------------- | ------- | -------------------------------------------------------------- |
| Whole body | `BODY_STRETCH`  | 0.008   | Vertical stretch anchored at the feet — rigid everywhere else. |
| Belly      | `BELLY_SCALE`   | 0.12    | Swell about (633, 795), gated by `BELLY_MASK_LO` / `_HI`.      |
| Cat ears   | `EAR_CAT_RAD`   | 0.05    | Rotation about (803.5, 661) and (874, 630) — one per ear.      |
| Bunny ears | `EAR_BUNNY_RAD` | 0.08    | Rotation about (1099, 587) and (1153, 597).                    |
| Cat tail   | `TAIL_RAD`      | 0.096   | Rotation about the hips (820, 873).                            |
| Hair / bow | `HAIR_PX`       | 3       | Horizontal sway at the tips, growing towards the bottom.       |

Faces never deform: the masks only cover belly, ears, tail, hair and bow, and the whole-body term
is a rigid vertical stretch anchored at the feet.

**Belly gate.** The belly mask is one soft blob across the guy's whole torso, so a raw radial
swell would push his arms out with it. The shader runs it through
`smoothstep(BELLY_MASK_LO, BELLY_MASK_HI, cm.r)` = `smoothstep(0.3, 0.75, …)`. Measured on
`forest-loading-mask-chars.webp`, his hands read 0.12–0.27 and the belly itself 0.38–1.0 — so the
hands never move, and the swell feathers in across the belly's own gradient instead of stopping at
a boundary (which would show as a ring around his middle). **Re-measure those two bounds if the
masks are regenerated.**

**Pad rule.** Max displacement must stay below `PAD.chars` (24 art px) or quad edges get clipped as
straight cut lines. Current worst case: tail tip ≈ 100 px × 0.096 ≈ 9.6 px.

## Progress

The bar is a **mossy log frame around a warm lantern fill**, painted entirely with CSS gradients:
bark (a lit top edge, vertical grain, a dark underside) → a recessed soil well with pixel ticks,
moss tufts and a slow sheen → an amber fill (`#b45309 → #f59e0b → #fde68a`) with a gloss top edge
and a two-step outer glow.

The fill **must stay the `::after` pseudo-element** — `setBootProgress` reads
`getComputedStyle('.progress-bar', '::after').transform` to find out where the fake fill stood when
real progress takes over. `::before` is free for the well. Only the paint is restyleable, never
the element structure.

The bar has two phases:

1. **Fake.** CSS `boot-bar-fill` scales the fill to 92 % over 10 s, with the runner following it.
   This covers the case where Phaser never emits progress at all.
2. **Real.** On the first `load.progress` event, `setBootProgress` reads where the CSS fill
   currently is (`f0`, from `getComputedStyle(…, '::after').transform`), adds `boot-real`, and
   maps every later value into `[f0, 0.97]` with `mapRealProgress`. The CSS hand-over rules then
   drive both the fill and the runner from `--boot-p`.
    - Progress is **monotonic** (`nextProgress`): Phaser emits `1` and then `0` for the next scene.
    - The cap stays below 1 so only `boot-done` ever shows a full bar.
    - Once `#boot` is gone or has `boot-done`, `setBootProgress` is a no-op.

At `boot-done` the bar and runner transition to 100 % and the arch brightens for `ARCH_GLOW_MS`.

The runner's centre always stands on the head of the fill. The fill does not span the whole bar
(it is inset by the 3 px frame plus the 4 px well on each side), so `.progress-wrapper` defines
`--fill-x0` (7 px) and `--fill-w` (`100% - 14px`), and every runner position — the fake keyframes,
the `--boot-p` hand-over and `boot-done` — is `--fill-x0 + p × --fill-w`, the same span the fill
uses. Change the frame or well padding and these two must change with it.

### The runner

The figure walking the bar is the chubby boy from the left of the art, redrawn as a **20×24 pixel
sprite** in `runner.ts` — short, round, big-headed:

- The data is four frames of 24 row strings of 20 characters, one character per palette entry
  (`RUNNER_PALETTE`: `o` outline, `H`/`h` hair, `S`/`s` skin, `G`/`L` glasses, `T`/`t` tank top,
  `C`/`c` cargo, `W`/`x` sneakers). `.` is transparent. The tests assert all four frames are exactly
  20 × 24, that no character falls outside the palette, that the tank top is cropped at the chest
  (rows 12–13) above a bare belly with a navel (rows 14–16), that the cargo (with side pockets) sits above the sneakers, that the four
  frames are all different, and that nothing above the belly moves.
- **Crisp only at whole multiples.** The canvas backing store is exactly 20 × 24 and is never
  scaled. CSS sizes it to 2× that (40 × 48 px) on desktop and 1× (20 × 24 px) on a phone with
  `image-rendering: pixelated`. Both are integers — at any other factor nearest-neighbour gives
  uneven 1px/2px blocks, so **never** give `.pixel-runner` a free-form size.
- **Four frames, one breath.** `runnerFrameAt(t, w)` steps through
  `RUNNER_STEPS_PER_BREATH` (4) frames per `2π / BREATH_W` — the same period as `breath()` — so the
  stride is evenly spaced in time (≈0.79 s per frame) and one full walk cycle lands on one breath.
  The cycle is contact / pass / contact / pass; the two pass frames are bobbed up one sprite pixel
  (`bob: 1`, applied at draw time, so no separate CSS animation is needed).
- The frame is picked from the breath **phase**, not its value: the breath curve is flat at its
  peak, so a value-quantised flip there would be invisible.
- `grok/runs/render-runner-preview.mjs` renders every frame to
  `grok/runs/runner-preview-8x.png` at 8× (it parses the sprite rows out of this module and writes
  a PNG with `node:zlib` — no dependencies). Run it after editing the sprite.
- `mountRunner(root)` injects the canvas, owns its own rAF, pauses while the tab is hidden and
  stops itself when the splash is removed. It is mounted from `startBootLoading` **before** the
  static-fallback gate, so the runner walks on the no-WebGL path too. Under
  `prefers-reduced-motion: reduce` he is posed once and not walked.

### Panel height

The art is never shrunk to make room for the panel, so the panel is what has to stay short — it
must top out below the characters' feet line (art y 965). `.boot-content` is therefore
width-constrained (`min(88vw, 460px)`) with tight gaps. Its bottom padding reserves a little extra space (12 px, 6 px on a phone)
below the bar, lifting it slightly off the bottom edge. On `max-width: 560px` or
`max-height: 520px` it shrinks the runner (48 → 24 px) and tightens further. There is no visible
text under the bar at all — the `LOADING THE FOREST…` line is visually hidden and only reaches
screen readers (`role="status" aria-live="polite"`), exactly like the `<h1>`.

Re-measure the panel against the feet line after changing any size in it; `coverFit` will not
do it for you.

## Fallbacks

The animated splash is skipped — the static `<img>` and the CSS bar are the whole experience — when:

| Condition                                 | Detected by                               |
| ----------------------------------------- | ----------------------------------------- |
| `BOOT_LOADING.ENABLED === false`          | `shouldUseStaticFallback` (checked first) |
| `prefers-reduced-motion: reduce`          | `shouldUseStaticFallback`                 |
| Low-end device (≤ 2 cores or ≤ 2 GB)      | `isLowEnd` + `shouldUseStaticFallback`    |
| No WebGL context                          | `canvas.getContext('webgl')` returns null |
| An image fails to decode                  | `try` around the `Promise.all`            |
| Shader compile / link failure             | `createForestGL` throws → `console.warn`  |
| Context lost (driver reset, GPU pressure) | `webglcontextlost` → `dispose()`          |

The gate is evaluated **before** any WebGL context is created, so the static path never leaks a
context. `dispose()` is idempotent, removes the canvas first (whatever happens, the static art is
what stays on screen), and treats `loseContext()` as best effort. Every exit that happens _after_
the context exists also goes through `releaseContext()` — the canvas is never inserted on those
paths, so `dispose()` would have nothing to remove but the context.

**Re-fitting.** The debounced `resize` / `orientationchange` / `visualViewport` listeners are
registered right after the first `applyFit()`, i.e. **before** the fallback gate, so the static
splash re-fits on rotation too (the cover fit is a pure function of the stage box; a static splash
that never re-fits is exactly how a rotated phone grows empty bands along an edge). A single
mutable `refit` starts out as `applyFit` and is swapped for the full `resize` once WebGL is up; the
static path tears the listeners down from a `MutationObserver` when `#boot` is removed, and the
WebGL path tears them down through `dispose()`.

## Rules and pitfalls

- **Never put `filter`, `mask-image`, `backdrop-filter` or a `background` on the canvas.** Chrome
  paints such a canvas as a white box while it loads.
- **The canvas CSS box, its backing store and `uFit` must all come from the same stage box**
  (`stageSize`). Sizing one from the content box and the others from the padding box stretches the
  frame — visibly so on a device with safe-area insets.
- Sample masks with `vArt`, never with the displaced `p`.
- Multiply any added constant colour by `c.a` in premultiplied output.
- Keep the `#boot` / `boot-done` contract: `PhaserGame.tsx` owns `boot-done` and the removal, and
  must not need to know whether the animated splash is running.
- Signs in an inverse-warp shader: moving the _sample point_ towards a centre makes the content
  bigger. If something moves the wrong way, flip that one term.
- **Regenerating the assets:** the four layers must re-stack to exactly the key art, or the first
  animated frame will visibly differ from the static one. Keep the masks as RGB (no alpha), keep
  the rects in `LAYER_RECT` in sync with the generator, and re-run `pnpm test` — the layout tests
  assert there is no gap at 390×844, 360×640, 1920×1080, 844×390 and 3440×1440 (and nine more
  viewports), that the scale is never below plain cover, and that nothing is distorted.
- **The sparkles in the sky are painted into the key art**, not an effect. The whole sky is frozen
  in the shader, but the art still shows painted sparkles; removing those would mean regenerating
  the images, which is out of bounds.
