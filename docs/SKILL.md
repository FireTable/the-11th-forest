# SKILL · Maintaining `public/data/`

A working playbook for the AI assistant (or any human) who needs to add
characters, tune monsters, balance weapons, or regenerate audio / sprite
art. The goal is **no guessing**: every change routes through a schema,
a single source of truth, and a verifiable test.

Read this top to bottom before touching `public/data/`. Pair with the
per-module docs ([WEAPONS.md](./WEAPONS.md), [MONSTERS.md](./MONSTERS.md),
[CHARACTERS.md](./CHARACTERS.md), [DROPS.md](./DROPS.md), [AUDIOS.md](./AUDIOS.md),
[SCENES.md](./SCENES.md)).

## The Golden Rule

> **Add a yaml field before adding a code path.** If a behaviour isn't
> expressible in the schema, extend the schema first — never inline it
> in the controller. Tweak the schema, fill in the spec, write the logic
> that reads it. The next entity gets it for free.

Why: every module follows `yaml → schema (Zod) → parser → loader → logic`.
If the schema doesn't carry the field, the runtime can't read it without
hand-rolling a code path per entity. Per-entity code paths are the
classic "where do I even look for this bug" trap.

## The directory layout

```
public/data/
├── audios/
│   ├── index.yaml           # sfx: [] and music: [] manifests
│   ├── sfx/<id>.yaml        # one per sound
│   └── music/<id>.yaml      # one per BGM track
├── characters/<id>.yaml     # kitty / otaku / bunny-girl / wanderer
├── drops/<id>.yaml          # hp-shard / sp-fragment / ammo-cache /
│                            # overcharge-core / weapon-drop
├── levels/
│   ├── index.yaml
│   └── <id>.yaml            # tavern / sacred-forest-sanctuary /
│                            # forest-path / sunlit-henge
├── monsters/<id>.yaml       # drone / gunner / stalker / sniper /
│                            # warden / keeper
└── weapons/<id>.yaml        # player + monster weapons

public/assets/
├── audio/{sfx,music}/<id>.{wav,mp3}
└── image/{characters,monsters,weapons,drops,scenes,materials}/<id>.png
```

## The schema-first workflow

For any new entity — a character, a weapon, a monster, a drop, a sound
— do this **in order**:

### 1. Open the schema first

Every module has `src/lib/<module>/schema.ts` with the source-of-truth
Zod schema. Read the file. **Do not guess field names** — copy them
from the schema. Common pitfalls:

| Module     | Schema file                              | Type of enum / range notes                                |
| ---------- | ---------------------------------------- | --------------------------------------------------------- |
| characters | `src/lib/characters/schema.ts`           | `gender: 'male' \| 'female'`; `weaponMax: 1..8`; `stats.strength`: 1..10 |
| monsters   | `src/lib/monsters/schema.ts`             | `hp >= 0`; `moveSpeed > 0`; `drops[].chance`: 0..1        |
| weapons    | `src/lib/weapons/schema.ts`              | Ranged needs `projectile`; melee needs `hitWidth`+`hitHeight`; both is rejected by `superRefine` |
| drops      | `src/lib/drops/schema.ts`                | `effect.type` is the discriminator — exactly one of `instant`/`refill-ammo`/`weapon` |
| audios     | `src/lib/audios/schema.ts`               | `kind: 'sfx' \| 'music'`; `id` must match filename; music `volume` default 0.5 |
| levels     | `src/lib/levels/schema.ts`               | `imageSize: 'WxH'`; `airWalls[].kind: 'tall' \| 'short'`; `materials[].mode: 'background' \| 'y-sort' \| 'foreground'` |

### 2. Check that the schema validates your idea

If a behaviour isn't expressible, **edit the schema first**, then the
parser (rare), then the controller. The schema is the contract; the
controller is downstream.

### 3. Write the yaml matching the schema

```yaml
# Quick checklist
[ ] `id:` field set (loader overwrites with the filename anyway)
[ ] filename basename == id (for audios, characters, drops, monsters,
    weapons — these are checked at parse time)
[ ] all required fields present
[ ] optional `prompt:` block present for AI regen if you plan to regen
[ ] `index.yaml` updated to include the new id in render order
```

### 4. Validate

```bash
pnpm tsx scripts/validate-levels.ts   # only validator today — levels
                                     # only. Add a new validator only
                                     # if your change crosses files
                                     # (e.g. level.spec ↔ monster index).
```

For everything else, Zod's `parseXxxYaml` runs at first load. A typo
surfaces immediately as a console error with the offending field name.
If you want to preflight:

```bash
pnpm tsx -e "
  import('./src/lib/characters/parser.ts').then(async ({ parseCharacterYaml }) => {
    const text = await (await import('node:fs/promises')).then(f => f.readFile('public/data/characters/wanderer.yaml', 'utf8'));
    console.log(parseCharacterYaml(text, 'wanderer'));
  });
"
```

(Don't commit this snippet — schemas parse on the next game launch.)

### 5. Run the gates

```bash
pnpm type-check     # tsc --noEmit
pnpm test           # vitest run — covers parsers, planDropEffect,
                    # spawn queue, hurt-routing, etc.
```

A schema change is a **refactor** and must keep tests green. A new
field added to the schema with no consumer is fine; a *removed* field
breaks parsers and tests.

## Adding a character

This is the most common task. Walk it end to end:

1. **Plan the identity.** Pick the character's role (tank / dps / scout /
   caster). Decide base stats in the **balance table** below — start in
   the middle of each range and adjust after playtesting.
2. **Generate the sprite sheet** (4×4, magenta chroma key). The prompt
   template in `wanderer.yaml → prompt:` is the canonical reference.
   Use:

    ```bash
    pnpm tsx scripts/generate-image.ts <id>     # writes to ./tmp/image/...
    pnpm tsx scripts/split-sheet.ts --id=<id> --in-place
    ```

   The split-sheet step down-samples + chroma-keys. Result goes to
   `public/assets/image/characters/<id>.png`. Verify the cell
   layout matches the schema (4×4, 15 frames + 1 empty cell).

3. **Write the yaml** at `public/data/characters/<id>.yaml`. Required
   fields: `id`, `name`, `hp`, `sp`, `moveSpeed`, `spRegenMs`, `body`,
   `dodge`, `hotbar`. Recommended additions: `gender` + matching
   `sfx.hurtMale`/`hurtFemale`, `description`, `weaponMax`,
   `stats` (1..10 flavour), `sfx.footstep`, `sfx.lowHpHeartbeat`.
4. **Append to index** at `public/data/characters/index.yaml`.
5. **Add to the tavern** at `public/data/levels/tavern.yaml → npcSpawns:`
   so the player can select the character.
6. **Playtest in the editor** — open `?editor=1`, switch to the Tavern
   scene, confirm the NPC sprite + stats render in the HUD radar.
7. **Commit** as `feat(characters): add <id>` with the yaml + sprite.

## Balance numbers (current set, post-playtest)

These are the working ranges after the level-1 + level-2 passes. Use
them as the starting window — if a new entity sits far outside, it'll
either trivialize a level or be unkillable. Re-tune the encounter, not
the entity, before pushing the bounds.

### Characters (player)

| Stat        | Range       | Notes                                                            |
| ----------- | ----------- | ---------------------------------------------------------------- |
| `hp`        | 85..100     | kitty = 85, wanderer/otaku = 100 — visible spread in tavern radar |
| `sp`        | 60..90      | kitty = 90 (caster), wanderer/otaku = 60 (melee bias)            |
| `moveSpeed` | 4..5        | 4 = Matter velocity ≈ 4 px/tick (≈ 1.6 m/s). 5 = fast scout      |
| `spRegenMs` | 4000..5000  | 4000 = aggressive caster, 5000 = conservative                    |
| `weaponMax` | 3..4        | otaku = 4 (carry more, lower sp); rest = 3                       |

**Dodge** is a per-character multiplier on `moveSpeed` with its own
i-frame budget. Keep the budget tight (`durationMs: 200..240`,
`cooldownMs: 500..600`) or the character dodges too often for the
weapon-tick to land.

### Monsters

| Stat        | Range        | Notes                                                       |
| ----------- | ------------ | ----------------------------------------------------------- |
| `hp`        | 90..1200     | sniper = 90 (fragile), keeper = 1200 (boss)                 |
| `moveSpeed` | 2.5..6       | sniper/warden = 2.5 (slow heavy), stalker = 6 (rusher)      |
| `body`      | 14×14..24×24 | default 14×14, larger bosses 24×24                          |

**Design rule:** a monster's effective DPS = `weapon.damage / weapon.cooldownMs`.
The player should be able to kill it in ~2–4 seconds of focused fire, and
it should be able to kill the player in ~3–5 of its own uninterrupted
attack cycles. If the math doesn't balance, fix the weapon's `damage` /
`cooldownMs`, not the monster's `hp`.

### Player weapons (range + dps envelope)

| Weapon        | damage | cooldownMs | range | dps      | Role                       |
| ------------- | ------ | ---------- | ----- | -------- | -------------------------- |
| assault-rifle | 2      | 100        | 550   | 20       | chip / baseline            |
| laser-cannon  | 2      | 60         | 700   | 33       | sustained beam             |
| shotgun       | 5×5=25 | 800        | 400   | ~31 burst| close-quarters burst       |
| plasma-sword  | 22     | 400        | 180   | 55       | melee AOE                  |
| arcana-staff  | 14     | 350        | 1000  | 40       | long-range caster          |
| rocket-launcher | 55   | 1200       | 800   | 46       | heavy burst                |

When adding a new weapon, place its dps on the **same axis** as an
existing one (rifle=20, laser=33, plasma=55) — don't sneak in 80 dps
without compensating with cooldown. The radar HUD reads `weaponMax`
per character; the player can't carry every weapon, so a hotbar slot
costs balance budget.

### Drops (resource economy)

| Drop            | hp | sp | ammoFraction | Notes                               |
| --------------- | -- | -- | ------------ | ----------------------------------- |
| hp-shard        | 25 | 0  | —            | baseline heal tick                  |
| sp-fragment     | 0  | 30 | —            | baseline sp tick                    |
| overcharge-core | 50 | 50 | —            | rare — both at once                 |
| ammo-cache      | —  | —  | 0.3          | refill 30 % of active clip          |
| weapon-drop     | —  | —  | —            | tavern-only, weaponId per spawn     |

Keep `hp-shard`/`sp-fragment` cheap (25/30) so the player isn't starved
between encounters. `overcharge-core` should be rare enough that a
floor of three feels like a windfall, common enough that the player
hits one every 1–2 encounters.

## Adding / tuning a monster

Walk the same schema-first path. Specifically:

1. Open `src/lib/monsters/schema.ts`. Confirm `weaponId`, `hp`,
   `moveSpeed`, `body`, `drops`, `sprite`, `anims`, `sfx` all map to
   what you want.
2. Pick a weapon from `public/data/weapons/` (or write a new one) whose
   range + dps fits the encounter design.
3. Set `drops: []` if it's a miniboss with no loot (the controller
   skips the roll); otherwise list `{ dropId, chance }` per drop
   and confirm the chance sums to ≤ 1.0 — overlap is allowed but
   "100% hp-shard + 100% sp-fragment" means guaranteed double drop.
4. `sprite.anims` should cover `idle / move / hit / death` (15 frames
   total + 1 empty cell). The controller requires these four keys
   when a sprite is set.
5. Add to `index.yaml`, drop into the level's `monsters:` list,
   validate, playtest.

## Adding a new scene

See [`SCENES.md`](./SCENES.md#adding-a-new-scene). The TL;DR:

1. Generate background: `pnpm tsx scripts/generate-image.ts <id>`.
2. Move the PNG to `public/assets/image/scenes/<id>.png`.
3. Write `public/data/levels/<id>.yaml` with `title`, `background`,
   `imageSize: 'WxH'` matching the PNG, and any airWalls / monsters /
   dropSpawns / materials / teleporters you need.
4. Append the id to `public/data/levels/index.yaml`.
5. `pnpm tsx scripts/validate-levels.ts` — checks both `index.yaml`
   coverage and `imageSize ↔ PNG dimensions` parity.
6. Open `?editor=1` and use the Air-walls / Monsters sub-tabs to
   fill in the rest of the level.

## AI asset regeneration

We use two external services:

- **Google Nano-banana 2** (Gemini 3 Pro Image) — every visual asset
  (characters, monsters, weapons, drops, scenes, materials).
- **ElevenLabs** — SFX regen via `scripts/elevenlabs-sfx.ts`.

### Regenerate a sprite

```bash
# 1. write / edit the prompt in the yaml's `prompt:` field
# 2. invoke the generator — the prompt is read from the yaml
pnpm tsx scripts/generate-image.ts <id>            # writes to ./tmp/image/<model>-<ts>.png
# 3. preview the result; iterate on the prompt if needed
# 4. happy? commit the new PNG and the updated yaml
```

### Regenerate an SFX

```bash
pnpm tsx scripts/elevenlabs-sfx.ts                    # regenerate every id in index
pnpm tsx scripts/elevenlabs-sfx.ts shotgun-shoot      # regenerate one
```

Requires `ELEVENLABS_API_KEY` in `.env.local` (see `.env.example`).
Free tier is ~50 generations/month, **non-commercial only** — upgrade
before release. The script only generates files that are missing, so
re-running after a manual edit won't clobber the file.

**Tuning the prompt:** the most common failure modes are
"animation cycles don't tile seamlessly" and "wrong number of cells".
The `prompt:` field in `wanderer.yaml` / `drone.yaml` is the canonical
template — read it before authoring a new one. The HARD NEGATIVE list
is what stops the model from adding grid lines, watermarks, etc.

## Common pitfalls (with the fix)

| Symptom                                                    | Cause                                                                | Fix                                                                                       |
| ---------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Schema validation error on `superRefine` ("must be either…") | weapon yaml has both `projectile` AND `hitWidth`                      | pick one (ranged vs melee)                                                                 |
| `Monster.spec` `weaponId` not found                         | referenced weapon id not in `weapons/index.yaml`                      | add the weapon yaml first                                                                 |
| Monster won't aggro the player                              | `weaponId` points to a weapon with `cooldownMs: 0` and no projectile  | the controller treats `cooldownMs: 0` as "never fires" — set to ≥ 50                       |
| Tavern HUD radar looks flat                                 | every character sits in the same stat band                            | widen the spread: at least one stat should differ ≥ 20% from the others                    |
| Character restore lands at (0, 0)                           | missing `playerSnapshot` and `characterSpawn`                          | ensure the level YAML has `characterSpawn:` or the camera centres on image mid             |
| BGM doubles up when crossing scenes                        | you emitted `MUSIC_EVENT` from a place that bypassed the scene's `create()`  | scenes should be the only emitter; remove the manual emit                                |
| `parseWeaponYaml` rejects `projectile.visual.color: 0x...` | color must be **string** (`'0xE0C071'`) not number                    | hex literal in `bullet.color` only — `projectile.visual.color` is the legacy numeric path  |
| `?scene=` URL is ignored                                    | a save exists with `currentLevelId`                                   | `useGameStore.getState().clearSaveData()` or use the editor's jump-to-scene                 |

## When to write new code (not just yaml)

Almost never. The schema-first rule covers 95% of balance + content
work. The cases that justify code:

- **New trigger kind for monster spawns** — extend `MonsterTriggerSchema`
  in `src/lib/monsters/schema.ts` and the reducer in
  `src/game/monsters/spawn-queue.ts`. See [`MONSTERS.md`](./MONSTERS.md).
- **New HUD element** — wire a new `useGameStore` selector + a new
  component under `src/components/hud/`. The scene pushes data on
  the 1Hz tick; the HUD reads it.
- **New event category** — add a typed helper to `src/lib/constants.ts`
  (`*_EVENT(id)`), emit, document in [`EVENTS.md`](./EVENTS.md).
- **New drop effect** — add a new variant to `DropEffectSchema` and
  extend `planDropEffect` in `src/game/drops/logic.ts`. The controller
  dispatches via `cb.onX` callback.

If you find yourself adding a conditional in the controller for "if
this entity has flag X, do Y" — stop. Add `X` to the schema, then
read it without a branch.

## Pre-commit gates

Husky + lint-staged runs:

1. `prettier --write` on staged files
2. `eslint --fix` on staged files
3. `tsc --noEmit` on the whole project
4. `vitest run` on the whole test suite

A yaml-only change still triggers the gates — so schema drift fails
fast. If you intentionally break a yaml format (e.g. for a refactor),
run `pnpm test` first and fix the parser tests before committing.

## Quick reference — commands

| Task                              | Command                                              |
| --------------------------------- | ---------------------------------------------------- |
| Dev server                        | `pnpm dev`                                           |
| Run all tests                     | `pnpm test`                                          |
| Watch tests                       | `pnpm test:watch`                                    |
| Type-check                        | `pnpm type-check`                                    |
| Format                            | `pnpm format`                                        |
| Lint                              | `pnpm lint`                                          |
| Validate level yamls              | `pnpm tsx scripts/validate-levels.ts`                |
| Generate one image                | `pnpm tsx scripts/generate-image.ts <id>`            |
| Re-chroma-key an existing sprite  | `pnpm tsx scripts/split-sheet.ts --id=<id> --in-place` |
| Regenerate one / all SFX          | `pnpm tsx scripts/elevenlabs-sfx.ts [id]`            |
| Editor panel                      | open `http://localhost:8080/?editor=1`               |

## Closing thought

The yaml files are the game. The TypeScript is the interpreter.
Most of your time on `public/data/` should feel like writing config,
not fighting code. When it stops feeling like config, that's the
signal to extend a schema — not to add a branch.