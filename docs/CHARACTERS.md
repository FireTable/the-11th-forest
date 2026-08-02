# CHARACTERS

The player character. One yaml per character (currently just `wanderer`); the controller owns the runtime.

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

public/data/characters/
├── index.yaml
└── wanderer.yaml
```

## YAML schema — `public/data/characters/<id>.yaml`

```yaml
id: wanderer # optional; loader overwrites with filename
name: Wanderer
imageSize: 2048x2048 # AI-gen template size, ignored at runtime

hp: 100
sp: 100
moveSpeed: 220 # px/sec
spRegenMs: 1000 # SP regen interval

gender: female # 'male' | 'female' — affects hurt sfx routing

body: # Matter rectangle half-extents
    halfW: 28
    halfH: 24

dodge: # Shift-dash tuning
    spCost: 15
    speed: 14 # multiplier over moveSpeed during dash
    durationMs: 220 # i-frame + dash duration
    cooldownMs: 600

hotbar: # starting weapons in display order
    - assault-rifle
    - laser-cannon
    - plasma-sword
    - shotgun
    - arcana-staff
    - rocket-launcher

sprite:
    texture: assets/image/characters/wanderer.png
    grid: { rows: 4, cols: 4 }
    scale: 1.2
    offset: { left: -6, bottom: -2 }
    script:
        downsample: 4
        colors: 32
        pad: 2

anims:
    idle: { frames: [0, 4], frameRate: 3, repeat: -1 }
    walk: { frames: [5, 9], frameRate: 12, repeat: -1 }
    dodge: { frames: [10, 14], frameRate: 16, repeat: 0 }

sfx: # per-character audio identity
    dodge: dodge
    hurtFemale: player-hurt-female # used when gender=female
    hurtMale: player-hurt-male # used when gender=male
    footstep: footstep
    footstepThrottleMs: 200 # min gap between footstep sfx
    lowHpHeartbeat: low-hp-heartbeat
    lowHpThreshold: 0.3 # HP fraction that starts the loop
    lowHpPulseMs: 900

prompt: | # AI sprite-sheet template (chroma key)
    The 11th Forest — Wanderer sprite sheet
    …
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

## Events emitted

| Event                                          | When                                                     |
| ---------------------------------------------- | -------------------------------------------------------- |
| `sfx:dodge`                                    | Shift-dash triggered                                     |
| `sfx:hurtFemale` / `sfx:hurtMale` / `sfx:hurt` | took damage (gender-routed by `resolveHurtSfx`)          |
| `sfx:footstep`                                 | periodic, throttled by `sfx.footstepThrottleMs`          |
| `sfx:low-hp-heartbeat`                         | every `lowHpPulseMs` while HP ≤ `lowHpThreshold * maxHp` |
| `aim-crosshair-update`                         | every frame the aim moves (cursor + crosshair sync)      |

## Events subscribed

None — characters are pure emitters. Damage comes in via `controller.heal(-x, 0)`.

## Adding a new character

1. Generate the sprite sheet (4×4, magenta chroma) via `scripts/generate-image.ts <id>` + `scripts/split-sheet.ts`.
2. Write `public/data/characters/<id>.yaml` matching the schema above.
3. Append `<id>` to `public/data/characters/index.yaml`.
4. Reference it from a level: `public/data/levels/<level>.yaml → character: <id>`.
5. No TS code changes.

## Conventions

- **One yaml per character** (id == filename basename).
- **`hp` / `sp` / `moveSpeed` etc. live in yaml**, never as TS constants. CLAUDE.md rule #11.
- **`gender`** is optional. When set, `resolveHurtSfx` selects the matching `hurtMale`/`hurtFemale`; otherwise the legacy `hurt` is used.
- **`CharacterRuntimeParts` is the HUD seam** — never import React from `src/game/`. HUDs bind via `useGameStore` + the controller's optional callbacks.
- **HP/SP regen is per-character**; regen interval is configurable. The controller clamps HP to `[0, maxHp]`.
