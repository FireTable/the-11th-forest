/**
 * src/lib/constants.ts
 * --------------------------------------------------------------------------
 * Engine / structural constants — anything that is NOT a game-data value
 * goes here, prefixed by category so they're easy to scan and so a
 * missing import surface-area is obvious.
 *
 * Data-driven values (character body, weapon projectile visual, drop
 * visual, …) live in the relevant module's YAML files. This file is
 * only for the things that are "the same everywhere".
 */

// ─── Physics: Matter collision category bits + composite masks ──────────

export const CAT = {
    WALL_TALL: 0x0001,
    WALL_SHORT: 0x0002,
    CHARACTER: 0x0004,
    BULLET: 0x0008,
    MONSTER_MELEE: 0x0010,
    MONSTER_PROJECTILE: 0x0020,
} as const;

// ─── Rendering Depths / Z-Indices ─────────────────────────────────────
export const DEPTH = {
    BACKGROUND_IMAGE: 0,
    LIGHT: 1, // Renders over background image, under all materials, walls, and entities
    MATERIAL_BACKGROUND: 10,
    BULLET_TRAIL: 15,
    PROJECTILE_BASE: 20, // Min base depth for bullets so they always render OVER background materials
    // Y-sorting range for characters, monsters, bullets, and y-sort materials (PROJECTILE_BASE + y-coord + offset)
    FOREGROUND_MATERIAL: 10000,
    MELEE_SLASH: 12000,     // Slash arc always above foreground materials
    SELECTION_BOX: 15000,
    HUD: 20000,
} as const;

/** Categories that block the player's body (walls). */
export const WALL_PLAYER_MASK: number = CAT.WALL_TALL | CAT.WALL_SHORT;

/** Categories that damage the player on contact. */
export const CHARACTER_DAMAGE_MASK: number =
    CAT.WALL_TALL | CAT.WALL_SHORT | CAT.MONSTER_MELEE | CAT.MONSTER_PROJECTILE;

/** Categories that player bullets should hit. */
export const BULLET_HIT_MASK: number =
    CAT.WALL_TALL | CAT.WALL_SHORT | CAT.MONSTER_MELEE | CAT.MONSTER_PROJECTILE;

/** Categories a drop sensor responds to (character only). */
export const DROP_PICKUP_MASK: number = CAT.CHARACTER;

/** Player bullets hit tall walls + monsters, pass over short walls (cover).
 *  Symmetric to PROJECTILE_MONSTER_MASK. */
export const PROJECTILE_PLAYER_MASK: number =
    CAT.WALL_TALL | CAT.MONSTER_MELEE | CAT.MONSTER_PROJECTILE;

/** Monster projectiles hit player + tall walls. Symmetric to player. */
export const PROJECTILE_MONSTER_MASK: number = CAT.CHARACTER | CAT.WALL_TALL;

// ─── Input: Phaser keycodes (stable browser standard) ───────────────────
// Phaser's runtime top-level reads browser globals, so we can't import
// `Input.Keyboard.KeyCodes` from a Node-runnable test. Mirror the
// numeric values here — they're part of the browser standard.

export const KEY_W = 87;
export const KEY_A = 65;
export const KEY_S = 83;
export const KEY_D = 68;
export const KEY_SHIFT = 16;
export const KEY_SPACE = 32;
export const KEY_ONE = 49;
export const KEY_TWO = 50;
export const KEY_THREE = 51;
export const KEY_FOUR = 52;
export const KEY_FIVE = 53;
export const KEY_SIX = 54;
export const KEY_SEVEN = 55;
export const KEY_R = 82;

// ─── HUD: shared layout values (apply to all HUDs) ────────────────────

/** Distance from screen bottom for both character-hub + weapon-hud. */
export const HUD_BOTTOM_GAP = 14;

/** Inner padding around HUD content. */
export const HUD_BG_PAD = 4;

/** Shared bar/panel recessed-track colour (slate-800). */
export const HUD_BAR_BG = 0x1f2937;

/** Shared translucent panel backdrop (black @ alpha). */
export const HUD_PANEL_BG = 0x000000;

// ─── HUD: character-hub (HP / SP bars) ─────────────────────────────────

export const HUD_HP_PANEL_PADDING_X = 12;
export const HUD_HP_BAR_W = 220;
export const HUD_HP_BAR_H = 14;
export const HUD_HP_BAR_GAP = 6;
export const HUD_HP_NAME_OFFSET_Y = 4;

// ─── HUD: weapon-hud (hotbar) ─────────────────────────────────────────

export const HUD_WEAPON_PANEL_PADDING = 14;
export const HUD_WEAPON_PANEL_W = 244;
export const HUD_WEAPON_PANEL_H = 116;
export const HUD_WEAPON_SLOT_SIZE = 56;
export const HUD_WEAPON_SLOT_GAP = 8;
export const HUD_WEAPON_AMMO_BAR_Y = 32;
export const HUD_WEAPON_AMMO_BAR_H = 6;

// ─── HUD: status-hud (head reload indicator) ──────────────────────────

export const HUD_STATUS_BAR_W = 72;
export const HUD_STATUS_BAR_H = 8;
/** Offset above character center for the status bar. */
export const HUD_STATUS_OFFSET_Y = -34;
/** Duration of the "Full" fade-out after reload completes. */
export const HUD_COMPLETED_FLASH_MS = 600;
/** Track + fill base colour for the status bar. */
export const HUD_STATUS_BAR_BG = 0x052e16;
export const HUD_STATUS_BAR_FILL = 0xbbf7d0;
export const HUD_STATUS_LABEL_COLOR = '#bbf7d0';

/** Alpha applied to the track background. */
export const HUD_BG_ALPHA = 0.85;

/** Alpha for partial-fill rendering (HP / SP / reload / status). */
export const HUD_FILL_ALPHA = 0.95;

// ─── HUD: theme colors (fill + text) ──────────────────────────────────

/** Bar fill colours. */
export const HUD_HP_FILL = 0x22c55e; // green-500 — health
export const HUD_SP_FILL = 0x38bdf8; // sky-400   — stamina

/** Ammo / reload / hotbar fills. */
export const HUD_RELOAD_FILL = 0xfbbf24; // amber-400 — reload progress
export const HUD_SLOT_ACTIVE_FILL = 0xfde68a; // amber-200 — active slot bg
export const HUD_SLOT_INACTIVE_FILL = 0x1e293b; // slate-800 — inactive slot bg
export const HUD_SLOT_ACTIVE_BORDER = 0x92400e; // amber-800 — active slot border
export const HUD_SLOT_INACTIVE_BORDER = 0x334155; // slate-700 — inactive slot border

/** Bar / panel track colours. */
export const HUD_BAR_TRACK_ALPHA = 0.85;
export const HUD_PANEL_BG_ALPHA = 0.5;
export const HUD_PANEL_BORDER_ALPHA = 0.9;
export const HUD_WEAPON_PANEL_ALPHA = 0.55;
export const HUD_PANEL_RADIUS = 8;

/** CSS text colours. */
export const HUD_TEXT_NAME = '#86efac'; // green-300
export const HUD_TEXT_AMMO_BIG = '#fef3c7'; // amber-100
export const HUD_TEXT_DIM = '#94a3b8'; // slate-400
export const HUD_TEXT_LABEL = '#cbd5e1'; // slate-300
export const HUD_TEXT_AMMO_SMALL = '#e2e8f0'; // slate-200
export const HUD_TEXT_WEAPON_NAME = '#fde68a'; // amber-200
export const HUD_TEXT_ACTIVE = '#92400e'; // amber-800

/** Shared font sizes (px). */
export const HUD_FONT_NAME = '12px';
export const HUD_FONT_WEAPON_NAME = '13px';
export const HUD_FONT_AMMO_BIG = '22px';
export const HUD_FONT_SLOT_KEY = '11px';
export const HUD_FONT_LABEL = '10px';

/** Panel text padding from panel inner edge (px). */
export const HUD_WEAPON_TEXT_PAD_X = 12;
export const HUD_WEAPON_TEXT_PAD_Y_TOP = 8;
export const HUD_WEAPON_AMMO_BIG_OFFSET_Y = 6;
export const HUD_WEAPON_AMMO_MAX_OFFSET_Y = 32;
export const HUD_WEAPON_AMMO_BAR_X = 12;
export const HUD_WEAPON_SLOT_KEY_OFFSET_X = 4;
export const HUD_WEAPON_SLOT_KEY_OFFSET_Y = 2;
export const HUD_WEAPON_SLOT_AMMO_OFFSET_X = -4;
export const HUD_WEAPON_SLOT_AMMO_OFFSET_Y = -14;
export const HUD_WEAPON_SLOT_LABEL_OFFSET_Y = -4;
export const HUD_WEAPON_SLOT_BORDER_ACTIVE = 2;
export const HUD_WEAPON_SLOT_BORDER_INACTIVE = 1;
export const HUD_WEAPON_SLOT_OFFSET_X = 12;
export const HUD_WEAPON_SLOT_BOTTOM_GAP = 8;
export const HUD_WEAPON_AMMO_BAR_INSET = 24;

/** Status bar: bar-local vertical offset for the "Reloading…/Full" caption. */
export const HUD_STATUS_LABEL_OFFSET_Y = -2;

// ─── Combat: contact damage rate-limit (player) ────────────────────────

/** Minimum gap between consecutive damage events to the player. Prevents
 *  brush-by contact from stacking to death in a single frame. */
export const COMBAT_PLAYER_DAMAGE_COOLDOWN_MS = 100;

/** How long a monster's death animation lingers in a fade-out tween
 *  before the body is destroyed and dropped items are released.
 *  Long enough for the player to register the kill, short enough to
 *  not stall combat flow. */
export const MONSTER_DEATH_FADE_MS = 800;

// ─── Render: shared visual constants ──────────────────────────────────

/** Max trail positions kept per bullet for the bullet trail. */
export const RENDER_BULLET_TRAIL_LENGTH = 6;

// ─── Audio: EventBus event-name helpers ─────────────────────────────────
//
// AudioController subscribes to these. Other modules emit them; nobody
// imports the audio module directly. Naming follows `sfx:<id>` /
// `music:<id>` so the event name is a 1:1 map from the YAML id.

export const SFX_EVENT = (id: string): string => `sfx:${id}`;
export const MUSIC_EVENT = (id: string): string => `music:${id}`;
export const MUSIC_STOP = 'music:stop';
export const MUSIC_PAUSE = 'music:pause';
export const MUSIC_RESUME = 'music:resume';

/** Default cross-fade when a music stop / switch lacks an explicit fadeOut. */
export const AUDIO_DEFAULT_FADE_MS = 250;

// ─── Aim Assist: Magnetic Snap & Acceleration Breakout Constants ───────
export const AIM_ASSIST = {
    /** Mouse speed threshold (px/ms) required to break magnetic target lock. */
    BREAKOUT_SPEED: 3.5,
    /** Duration in ms that aim assist is disabled after a fast flick breakout. */
    BREAKOUT_DURATION_MS: 150,
    /** Distance radius in world px to initially snap onto a monster. */
    INITIAL_SNAP_RADIUS: 120,
    /** Max distance radius in world px to maintain sticky tether lock on an active monster. */
    STICKY_TETHER_RADIUS: 280,
} as const;

// ─── Drops: Parabolic Arc & Magnet Absorption Constants ─────────────────
export const DROP_CONFIG = {
    /** Whether to play sprite animations (false = display static frame 0). */
    ENABLE_ANIMATION: false,

    /** Parabolic arc jump configuration for dropped items */
    PARABOLA: {
        /** Arc animation duration in ms */
        DURATION: 450,
        /** Minimum random offset horizontal jump distance (px) */
        POP_RADIUS_MIN: 24,
        /** Maximum random offset horizontal jump distance (px) */
        POP_RADIUS_MAX: 48,
        /** Arc height peak offset (px) */
        ARC_HEIGHT: 32,
        /** Parabola trajectory line stroke color (gray) */
        LINE_COLOR: 0x9ca3af,
        /** Parabola trajectory line alpha */
        LINE_ALPHA: 0.4,
        /** Parabola trajectory line width (px) */
        LINE_WIDTH: 1.5,
    },

    /** Magnet attraction configuration when character gets near drops */
    MAGNET: {
        /** Attraction sensing radius around character (px) */
        RADIUS: 120,
        /** Lerp speed factor for flying towards character (0 ~ 1) */
        FLY_SPEED: 0.18,
        /** Minimum distance to trigger actual pickup (px) */
        PICKUP_DISTANCE: 16,
    },
} as const;

// ─── Graphics: Pixel Art Engine Lighting & Camera Filter Config ────────
export const PIXEL_LIGHTING_CONFIG = {
    /** Global toggle for pixel art engine lighting and camera filters. */
    ENABLE: true,

    /** Environment background tint when pixel lighting is active (soft ambient twilight). */
    BACKGROUND_TINT: 0x6c7c8c,

    /** PointLight warm amber color (torch light). */
    LIGHT_COLOR: 0xe8d5b0,
    /** PointLight horizontal radius (px). */
    LIGHT_RADIUS_X: 200,
    /** PointLight vertical radius matching 2.5D body perspective (200 * 24 / 28 ≈ 171px). */
    LIGHT_RADIUS_Y: 171,
    /** PointLight intensity (0.0 ~ 1.0). Very subtle mist glow. */
    LIGHT_INTENSITY: 0.1,
    /** PointLight edge attenuation factor (smooth natural diffusion without rings). */
    LIGHT_ATTENUATION: 0.05,

    /** Camera Pixelate filter amount (0 = off). */
    PIXELATE_AMOUNT: 0,

    /** Enable color quantization filter (false = smooth natural light diffusion without step rings). */
    USE_QUANTIZE: true,
    /** Camera Quantize filter step array per channel [R, G, B, A]. */
    QUANTIZE_STEPS: [32, 32, 32, 1],
    /** Whether to enable Bayer matrix ordered dithering. */
    QUANTIZE_DITHER: false,
} as const;
