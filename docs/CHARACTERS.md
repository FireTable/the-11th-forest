# CHARACTERS

Player characters. One yaml per character; the controller owns the runtime. The current set is `kitty`, `otaku`, `bunny-girl`, `wanderer` (four NPCs, all spawn in the tavern; selection is a single-player local game).

## File layout

```
src/lib/characters/
├── schema.ts      # CharacterSpecSchema, CharacterSfxSchema (with gender fields)
├── types.ts       # z.infer'd types
├── parser.ts      # parseCharacterYaml(text, id)
├── loader.ts      # fetchCharacter(id) via handle-fetch
└── index.ts       # public barrel

src/game/characters/
├── character.ts   # loadCharacter(scene, id) — assets + anim registration
├── keys.ts        # textureKey / animKey helpers
└── logic.ts       # CharacterController + pure helpers (moveIntent, dodgeIntent, resolveHurtSfx, clampToBounds)

src/game/scenes/
└── tavern-controller.ts  # phase 1 NPC spawn + A/D/F selection + phase 2 weapon cap

public/data/characters/
├── index.yaml
├── kitty.yaml
├── otaku.yaml
├── bunny-girl.yaml
└── wanderer.yaml
```

## YAML schema — `public/data/characters/<id>.yaml`

`id` is **required** (not optional) and must match the filename — the parser enforces this after safeParse so `spec.id` is always a string in the output type.

```yaml
id: wanderer # REQUIRED — must equal the filename basename
name: Wanderer
imageSize: 2048x2048 # optional (regex /^\d+x\d+$/); AI-gen template size, ignored at runtime
prompt: | # AI sprite-sheet template (chroma key)
    The 11th Forest — Wanderer sprite sheet
    …

description: | # free-form lore shown on the tavern character-select HUD.
    # A few sentences — who they are, role. Pure UI; not consumed by gameplay.
    # Optional; characters without one still load.

hp: 100 # starting HP (also the max for characters without regen)
sp: 60 # starting SP
moveSpeed: 4 # Matter velocity (px per physics tick at 60 fps; tunable range ~3..8)
spRegenMs: 5000 # ms between SP ticks

gender: female # 'male' | 'female' — picks hurtFemale / hurtMale from sfx
                # omit to use the gender-neutral sfx.hurt

body: # Matter rectangle half-extents — required
    halfW: 28
    halfH: 24

dodge: # Shift-dash tuning — required
    spCost: 15
    speed: 14 # multiplier over moveSpeed during dash
    durationMs: 220 # i-frame + dash duration
    cooldownMs: 600

hotbar: [] # starting weapons in display order; usually empty —
          # the tavern weapon-pickup phase is the default flow.

weaponMax: 3 # cap on weapons the character can carry in the tavern weapon-pickup
             # phase (1..8, default 3 if omitted). Per-character; drives the
             # tavern HUD radar + the replace-hub cap.

sfx: # per-character audio identity — all optional, all fall back to global ids
    dodge: dodge
    hurtFemale: player-hurt-female # used when gender=female
    hurtMale: player-hurt-male     # used when gender=male
    hurt: player-hurt              # gender-neutral fallback
    footstep: footstep
    footstepThrottleMs: 200 # min gap between footstep sfx
    lowHpHeartbeat: low-hp-heartbeat
    lowHpThreshold: 0.3 # HP fraction that starts the loop
    lowHpPulseMs: 900
    throttleMs: 1200 # min gap between hurt-sfx plays

sprite:
    texture: assets/image/characters/wanderer.png
    grid: { rows: 4, cols: 4 }
    scale: 1.2
    offset: { left: -6, bottom: -2 } # also accepts { x, y }
    script:
        downsample: 4
        colors: 32
        pad: 2

anims:
    idle:  { frames: [0, 4],  frameRate: 3,  repeat: -1 }
    walk:  { frames: [5, 9],  frameRate: 12, repeat: -1 }
    dodge: { frames: [10, 14], frameRate: 16, repeat: 0 }

stats: # OPTIONAL display-only stats shown in the tavern HUD radar (1..10).
       # Do NOT affect gameplay values — purely cosmetic flavour.
    strength: 5 # physical attack power
    agility:  7 # movement and dodge speed
    vitality: 6 # max HP and resilience
    spirit:   4 # max SP and skill potency
```

## Public API (`src/lib/characters/index.ts`)

```ts
import {
    parseCharacterIndex,
    parseCharacterYaml,
    fetchCharacter,
    fetchCharacterIndex,
    type CharacterSpec,
    type AnimSpec,
    type SpriteSpec,
} from '@/lib/characters';
```

## Logic

### `CharacterController` (in `src/game/characters/logic.ts`)

```ts
new CharacterController(scene, parts, spec);
```

Where `parts: CharacterRuntimeParts` is the bag of HUD/weapon refs the controller delegates to. Pure helpers (no Phaser) are also exported for testing:

| Helper                                                                   | Purpose                                                                      |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `moveIntent(keys)`                                                       | map key state → unit velocity                                                |
| `dodgeIntent(shift, intent, sp, spCost, cd, lastEnd, until, speed, now)` | decide dodge + return velocity                                               |
| `resolveHurtSfx(spec)`                                                   | pick `sfx.hurtFemale`/`hurtMale` based on `spec.gender`, fallback `sfx.hurt` |
| `clampToBounds(pos, halfW, halfH, worldW, worldH)`                       | clamp to arena rectangle                                                     |

`resolveHurtSfx` is the gender-routing pure helper (vitest-covered):

| `gender`   | `hurtFemale` set | `hurtMale` set | returns                    |
| ---------- | ---------------- | -------------- | -------------------------- |
| `'female'` | yes              | —              | `hurtFemale`               |
| `'female'` | no               | —              | `hurt` (fallback)          |
| `'female'` | —                | —              | `hurt` if set, else `null` |
| `'male'`   | —                | yes            | `hurtMale`                 |
| `'male'`   | —                | no             | `hurt` if set, else `null` |
| undefined  | —                | —              | `hurt` if set, else `null` |

### Controller methods

| Method                   | Purpose                                                                             |
| ------------------------ | ----------------------------------------------------------------------------------- |
| `update(now)`            | per-frame: HP/SP regen, low-HP heartbeat, dodge/footstep timers, drive anims        |
| `heal(hpDelta, spDelta)` | positive = heal, negative = damage; emits `sfx:hurtFemale`/`sfx:hurtMale` on damage |
| `refillAmmo(fraction)`   | delegated to `parts.weapons.refillActiveAmmo`                                       |
| `pickUpWeapon(weaponId)` | delegated to `parts.weapons.swapToWeapon`                                           |
| `destroy()`              | teardown                                                                            |

### HUD contract

The controller doesn't know about Phaser HUD objects directly — it operates on `CharacterRuntimeParts`:

```ts
interface CharacterRuntimeParts {
    weapons: WeaponsLike; // swapToWeapon, refillActiveAmmo
    statusHud?: StatusHudLike; // showFloatingNumber
    aimCrosshair?: AimCrosshairLike; // mouse-aim tween
    weaponHud?: WeaponHudLike; // update(reload, ammo, etc.)
}
```

This lets the HUD React layer (in `src/components/hud/`) plug in without the controller importing React or DOM types.

### `loadCharacter` (in `src/game/characters/character.ts`)

Async asset load + sprite registration. Returns a `CharacterRuntime` describing the textures + anims. Called from `src/game/main.ts` before constructing the controller.

## Tavern selection — `src/game/scenes/tavern-controller.ts`

Two-phase controller that runs when `level.tavern === true`:

- **Phase 1 — Selection.** All characters from `assets.allCharacters` are spawned as idle sprites at their `npcSpawns` positions (or evenly spaced if the level omits positions). A/D or click cycles focus; F (or mouse hold, 1.5 s) confirms. The picked spec is persisted via `useGameStore.setSelectedCharacterId(spec.id)` and handed to the scene via the `onConfirm(spec)` callback; the scene reloads with the chosen character.
- **Phase 2 — Weapon pickup.** The picked character is the player. Drop pickups run through `notifyWeaponAdded` / `isSlotLocked` / `requestWeaponReplace` callbacks. Weapon cap is per-character (`spec.weaponMax ?? TAVERN_WEAPON_MAX`).

The tavern HUD subscribes to the `tavern-focus` event, which carries a `TavernFocusPayload`:

```ts
interface TavernFocusPayload {
    name: string;
    hp: number;
    sp: number;
    moveSpeed: number;
    spRegenMs: number;
    description?: string;          // from the character spec
    stats?: { hp; sp; moveSpeed; weaponMax };
    statRange?: {                  // [min, max] across all loaded characters
        hp: { min; max };
        sp: { min; max };
        moveSpeed: { min; max };
        weaponMax: { min; max };
    };
    phase: 'selection' | 'pickup';
    weaponCount: number;
    weaponMax: number;
    viewportX?: number;            // NPC head position in CSS pixels (selection only)
    viewportY?: number;
    holding?: boolean;             // F / mouse long-press active
}
```

`statRange` drives the HUD's radar polygon: the inner ring is the weakest character's stat and the outer ring is the strongest, so a 5 HP vs 100 HP character visibly differs (without min-max scaling every HP value would cluster at 0.85–1.0). `computeStatRange()` is called once after `npcs` is rebuilt — recomputing on every focus event would be wasteful.

The controller updates the cursor (pixel crosshair + `aim-crosshair-update` events) while phase 1 is alive, and clears it on destroy.

## Events emitted

| Event                                          | When                                                     |
| ---------------------------------------------- | -------------------------------------------------------- |
| `sfx:dodge`                                    | Shift-dash triggered                                     |
| `sfx:hurtFemale` / `sfx:hurtMale` / `sfx:hurt` | took damage (gender-routed by `resolveHurtSfx`)          |
| `sfx:footstep`                                 | periodic, throttled by `sfx.footstepThrottleMs`          |
| `sfx:low-hp-heartbeat`                         | every `lowHpPulseMs` while HP ≤ `lowHpThreshold * maxHp` |
| `aim-crosshair-update`                         | every frame the aim moves (cursor + crosshair sync)      |
| `tavern-focus`                                 | tavern selection / phase change (from `TavernController`)|
| `player-died`                                  | HP reached 0                                             |

## Events subscribed

| Event                      | Purpose                                          |
| -------------------------- | ------------------------------------------------ |
| `mobile:move`              | touch-stick movement vector (vx, vy)             |
| `mobile:firing`            | touch fire button state                          |
| `mobile:dodge`             | touch dodge button state                         |
| `mobile:weapon:switch`     | touch weapon HUD slot tap (`{ index }`)          |
| `dev:cheat:infiniteHp`     | keep HP at max while toggled on                  |

Damage comes in via `controller.heal(-x, 0)`.

## Adding a new character

1. Generate the sprite sheet (4×4, magenta chroma) via `scripts/generate-image.ts <id>` + `scripts/split-sheet.ts`.
2. Write `public/data/characters/<id>.yaml` matching the schema above. **The `id:` field is required and must equal the filename basename.**
3. Append `<id>` to `public/data/characters/index.yaml`.
4. Add an entry under `npcSpawns:` in `public/data/levels/tavern.yaml` to make the character selectable.
5. Optionally reference from a level directly: `public/data/levels/<level>.yaml → character: <id>`. When omitted, the first entry in `index.yaml` is used as the default.
6. No TS code changes.

## Conventions

- **One yaml per character** (id == filename basename).
- **`id` field is required** in the yaml (parser enforces filename match).
- **`hp` / `sp` / `moveSpeed` etc. live in yaml**, never as TS constants. CLAUDE.md rule #11.
- **`gender`** is optional. When set, `resolveHurtSfx` selects the matching `hurtMale`/`hurtFemale`; otherwise the legacy `hurt` is used.
- **`CharacterRuntimeParts` is the HUD seam** — never import React from `src/game/`. HUDs bind via `useGameStore` + the controller's optional callbacks.
- **HP/SP regen is per-character**; regen interval is configurable. The controller clamps HP to `[0, maxHp]`.
- **`stats:`** are display-only flavour — never read by gameplay. Tweaking real balance means changing `hp` / `sp` / `moveSpeed` / `weaponMax` directly.
- **`description:`** is free-form prose, used purely by the tavern HUD's character card. Optional so existing characters without one still load.