// Kept in its own dependency-free module so the boot splash (src/boot.ts) never has to pull in
// the game-wide constants before it can paint. Re-exported from '@/lib/constants'.
// ─── Boot Loading: animated #boot splash (index.html) ─────────────────────
// Tunables for src/lib/boot-loading/. Amplitudes are in ART pixels (1920×1072 key art).
export const BOOT_LOADING = {
    ENABLED: true, // false = always the static image
    MAX_DPR: 2, // canvas backing store cap
    RAMP_MS: 300, // ease every deformation in from 0 after the canvas becomes visible
    BREATH_W: 3.2, // master breath angular speed → period 2π/3.2 ≈ 1.96 s
    // Mouse parallax (art px at full deflection; mouse is normalised to -1..1).
    // Only the title has parallax; bg, chars and fg stay locked together so feet meet their shadows.
    PARALLAX_TITLE: -4, // negative = moves against the others (floats "in front of" the sky)
    MOUSE_RATE: 4, // smoothing speed (1/s); higher = snappier
    // Where the depth mask stops reading as open sky, in mask units (depth R / 255). Measured on
    // forest-loading-mask-depth.webp: open sky sits at 0–27, foliage at 45+. These bounds freeze
    // ~86 % of the sky's residual sway while keeping ~96 % of the tree sway and 100 % of the
    // ground's. Re-measure them if the masks are ever regenerated.
    SKY_GATE_LO: 0.118,
    SKY_GATE_HI: 0.216,
    // Ground only — the sky has no effect of any kind left
    MUSHROOM_GLOW: 0.35, // extra brightness at pulse peak
    SWAY_PX: 1.6, // grass / leaf horizontal sway
    TITLE_FLOAT_PX: 5, // title bob amplitude (vertical, whole-layer translate on the breath br(t); up on inhale)
    // Character breathing (all on the master breath br(t), period 2π/BREATH_W)
    CHAR_LAG_S: [0, 0.35, 0.7, 1.05], // guy, cat, bunny, blonde — they don't breathe in sync
    BODY_STRETCH: 0.008, // vertical stretch anchored at the feet (≈3 px at the head)
    BELLY_SCALE: 0.12, // guy's belly swell about its centre (was 0.06)
    // The belly mask is one soft blob over the whole torso, so an ungated radial swell drags his
    // arms out with it. These gate the mask: measured on forest-loading-mask-chars.webp, his hands
    // read 0.12–0.27 and the belly itself 0.38–1.0, so the swell fades in over the belly's own
    // gradient, never touches his hands, and reaches the belly's core at full strength.
    BELLY_MASK_LO: 0.3,
    BELLY_MASK_HI: 0.75,
    EAR_CAT_RAD: 0.05, // ≈3°
    EAR_BUNNY_RAD: 0.08, // ≈4.6°
    TAIL_RAD: 0.096, // ≈5.5° (was 0.12, −20 %), lags 0.3 s behind the cat's breath
    HAIR_PX: 3, // hair-tip sway (blonde + bunny), lags 0.4 s
    // The stone arch: warm lantern light, pulsing gently from the moment the splash appears and
    // brightening when real progress reaches 100 %. It is a TINT, not an additive light — see
    // [[03-COLOR]] in gl.ts — so the bright stone can never clip to white.
    ARCH_X: 1631, // art px centre of the arch
    ARCH_Y: 469,
    ARCH_RX: 60, // glow falloff radii (art px)
    ARCH_RY: 90,
    ARCH_GLOW_IDLE: 0.25, // tint strength while loading
    ARCH_GLOW: 0.55, // tint strength at 100 %
    ARCH_GLOW_MS: 400, // how long the 100 % glow takes to ease in
    ARCH_GLOW_COLOR: [1.0, 0.85, 0.4], // #FFD966 — warm lantern yellow, rgb
    ARCH_PULSE_HZ: 1.2, // rad/s of the breathe — one breath ≈ 5.2 s
    ARCH_PULSE_AMT: 0.3, // ±30 % around the tint strength — a breath, not a flash
} as const;
