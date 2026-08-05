# SCENES

How a "scene" is loaded — the data flow, file layout, and runtime contract.

## TL;DR

Every scene is **one YAML** plus a background image:

| File                                  | Purpose                         | Read by       |
| ------------------------------------- | ------------------------------- | ------------- |
| `public/assets/image/scenes/<id>.png` | Background image                | Phaser        |
| `public/data/levels/<id>.yaml`        | Runtime level data (everything) | Game + Editor |

`<id>` is the kebab-case basename. There is **no per-level code** — a single generic `LoadScene` reads any of them. The filename is the canonical id; no `id` field in the YAML.

## File layout

```
public/
  assets/image/scenes/
    sacred-forest-sanctuary.png             # background
  data/levels/
    index.yaml                              # ordered manifest
    sacred-forest-sanctuary.yaml            # per-level runtime data
                                           # (walls + spawns + music + lighting + materials)

src/
  game/
    main.ts                                 # resolveScene() — pre-fetches every spec,
                                           # then constructs LoadScene
    scenes/scene.ts                         # LoadScene — generic renderer + systems
  lib/
    handle-fetch.ts                         # Node/browser unified fetch wrapper
    levels/
      schema.ts                             # LevelSchema + AirWall + MonsterSpawn + …
      types.ts                              # z.infer'd types (single source of truth)
      parser.ts                             # sync pure parsing (vitest-friendly)
      loader.ts                             # fetchLevel / fetchLevelIndex via handle-fetch
      index.ts                              # public barrel
      current-level.ts                      # module-level cache (Editor panel late-mount)
  store/game-store.ts                       # HUD state + the save file (see PERSIST.md)
```

## Runtime flow

```
src/game/main.ts:resolveScene()
    │
    ├── fetchLevelIndex()                    → first id (URL ?scene=<id> wins)
    ├── fetchLevel(id)
    ├── fetchCharacter(id)                  (or index[0])
    ├── fetchMonster(mid) × unique types    ← from level.monsters[].type
    ├── fetchDrop(did) × referenced types   ← static spawns + monster drop tables
    ├── fetchWeapon(wid) × hotbar + monster weaponIds
    ├── fetchAudioIndex() / fetchAudioSfx / fetchAudioMusic
    └── compute sprite-sheet cell dims      ← naturalSize / grid
        │
        ▼
   ResolvedScene { id, level, weapons[], weaponsById, character, spriteCell,
                   monsters, drops, sfx, music }
        │
        ▼
   new Phaser.Game({ scene: [new LoadScene(id, level, SceneAssets)] })
        │
        ▼
   LoadScene.preload()
      • background image
      • loadCharacterAssets / loadMonsterAssets / loadDropAssets / loadWeaponAssets
      • loadAudioAssets
      • MaterialManager.preloadMaterials
        │
        ▼
   LoadScene.create()
      1. Background image + optional pixel-lighting tint
      2. matter.world.setBounds + createWallBodies (air walls + outer)
      3. create{Character,Monster,Drop}Anims
      4. loadCharacter → CharacterRuntime + WASD/Shift/hotbar
      5. MonsterController — self-spawns from level.monsters (immediate + trigger-gated)
      6. DropController   — self-spawns from level.dropSpawns + death rolls
      7. Bullet→monster damage hook (matter collisionstart)
      8. AudioController — subscribes to sfx:*/music:* events
      9. emit MUSIC_EVENT(level.music) or MUSIC_STOP (when level.music unset)
         — see AUDIOS.md § "The BGM singleton"
     10. Camera center + MaterialManager + optional PointLight + Pixelate/Quantize FX
     11. per-frame: monsterSystem.update / dropSystem.update / material.update /
                    teleporterSystem.update / tickSaveState (1 Hz — clock + snapshots)
     12. setCurrentLevel + setCurrentLevelId + setLevelTitle + resume saved clock
     13. EventBus.emit('level-loaded', { id, level })
     14. EventBus.emit('current-scene-ready', this)   ← index.html boot splash fades out
```

Systems that find a saved snapshot in the store restore from it instead of
from the level YAML — see [`PERSIST.md`](./PERSIST.md).

## handle-fetch: the bridge

`src/lib/handle-fetch.ts` exports one function: `fetch`, same signature as global. In Node it lazily overrides `globalThis.fetch` so `/data/*` paths resolve to `public/data/*` on disk and are wrapped in a `Response`. The browser sees a pass-through.

Why this matters:

- Vite **externalises** `node:*` modules in browser bundles. `import { readFileSync } from 'node:fs'` would break at runtime.
- `fetch('/data/levels/X.yaml')` works in **both** runtimes — the wrapper handles translation on first call, lazily.
- Callers stay simple: `fetch('/data/...')`, no `if (browser) … else …`.

```ts
import { fetch } from '@/lib/handle-fetch';
const text = await (await fetch('/data/levels/<id>.yaml')).text();
```

This is the **only** approved way to read project resources in shared code (`src/`). Scripts under `scripts/` may use `node:fs` directly for non-`/data/*` reads. See CLAUDE.md rule #7.

## Scene id resolution

`src/game/main.ts` reads the scene id in this order:

1. **Saved `currentLevelId`** — the persisted level from the last session (see [`PERSIST.md`](./PERSIST.md)). Falls through to the next step if the id no longer resolves.
2. **URL query** — `?scene=<id>` (debug-only)
3. **`index.yaml[0]`** — first entry in `public/data/levels/index.yaml`

Note the consequence: once a save exists, `?scene=` no longer takes effect —
clear the save (`useGameStore.getState().clearSaveData()`) or use the editor's
jump-to-scene. On a first visit the URL override behaves as before.

## Level YAML schema — `public/data/levels/<id>.yaml`

The runtime level is **one self-contained file**: walls, every spawn, the music, the lighting, the decorative materials. Field-by-field reference:

```yaml
title: string # shown in the HUD; default = filename if absent
background: string # path under public/, e.g. assets/image/scenes/X.png
imageSize: 'WxH' # native image size — world bounds match this exactly
prompt:
    string # optional inline AI regen prompt (rarely used now;
    # generation historically lived in prompts/scenes/<id>.yaml)
music:
    string # optional — id from public/data/audios/index.yaml →
    #   emitted as MUSIC_EVENT(level.music) on create()
pixelLighting: boolean # optional — override PIXEL_LIGHTING_CONFIG.ENABLE

character:
    string # optional id from public/data/characters/index.yaml
    #   (defaults to the first index entry)
characterSpawn: # optional — where + which way the player starts
    facing: left | right
    x: number
    y: number
tavern:
    boolean # optional — when true, LoadScene enters tavern mode
    #   (NPCs render for selection; no monsters; weapon cap from
    #   character.weaponMax). The Forest Tavern scene sets this.
npcSpawns: # tavern-mode only — per-character NPC standing positions
    - characterId: string # id from public/data/characters/index.yaml
      x: number
      y: number

airWalls: # polygon obstacles in image pixel space
    - id: string # unique within the level
      kind:
          tall | short # tall: blocks character + bullets
          # short: blocks character only (bullets pass over)
      points: # polygon, implicitly closed; ≥3 vertices
          - [number, number] # rectangle = 4 vertices
      # Legacy form (still parsed and migrated to points):
      # x, y, width, height — converted to 4-vertex polygon by the schema

monsters: # optional — list of monster spawns
    - type: string # id from public/data/monsters/index.yaml
      x: number
      y: number
      waveId: string # optional — tag for clear-trigger grouping
      trigger: # optional — gate the spawn (see Spawn triggers)
          kind: time | clear
          delayMs: number # ≥0, default 0
          waveId:
              string # for kind:clear — which wave must be cleared first
              # for kind:time  — which wave this spawn belongs to

dropSpawns: # optional — static drops placed in the level
    - type: string # id from public/data/drops/index.yaml
      x: number
      y: number
      weaponId: # optional — when type='weapon-drop', the real weapon
          # to grant. Lets the generic weapon-drop spec serve every
          # weapon in the game from one yaml. See DROPS.md.

materials: # optional — decorative props (trees, rocks, …)
    - id: string # unique within the level
      texture: string # path under public/
      x: number
      y: number
      scale: number # >0, optional
      rotation: number # optional
      flipX: boolean # optional
      flipY: boolean # optional
      mode: background | y-sort | foreground # optional
      depthOffset: number # optional

teleporters: # optional — walk-in portals to another level
    - id: string # optional
      x: number
      y: number
      radius: number # >0, default 40 — trigger radius in pixels
      targetScene:
          string # optional id from index.yaml. Omitted → the next
          # entry in index.yaml, wrapping to the first at the end.
```

The parser strictly validates (Zod) and transforms:

- All `points` are rounded to integers.
- Legacy `{x, y, width, height}` rectangle air walls are auto-migrated to 4-vertex polygons — kept so old levels don't break; new levels should write `points` directly.

## Monster spawn triggers

Triggers let you gate monster spawns by time or by clear. Pure data — runtime evaluation lives in `src/game/monsters/monster.ts` (`advanceSpawnQueue` reducer in `spawn-queue.ts`).

| `trigger.kind` | Fires when                                                                                                                                                                                     |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `time`         | `levelStartElapsedMs + trigger.delayMs` — based on Phaser's `this.time.now`                                                                                                                    |
| `clear`        | No monster with `waveId === trigger.waveId` is alive **plus** `trigger.delayMs` after that moment. If a new spawn tags itself with the same `waveId` before the timer fires, the timer resets. |

When the trigger is absent, the spawn fires **immediately** at scene start.

`waveId` (on the spawn itself, not the trigger) is how you group multiple spawns into one wave. A `clear` trigger waits on the named wave. A `time` trigger can still tag its spawn with a `waveId` so a subsequent `clear` can wait on it.

Example — three waves from `sacred-forest-sanctuary.yaml`:

```yaml
monsters:
    - type: drone # wave-1 fires at scene start
      x: 800
      y: 800
      waveId: wave-1

    - type: drone # wave-2 fires 3s after wave-1 is cleared
      x: 1200
      y: 1000
      waveId: wave-2
      trigger:
          kind: clear
          waveId: wave-1
          delayMs: 3000

    - type: gunner # boss fires 5s after wave-2 is cleared
      x: 2000
      y: 600
      waveId: boss
      trigger:
          kind: clear
          waveId: wave-2
          delayMs: 5000
```

## `index.yaml` — manifest

```yaml
levels:
    - <id> # ordered; first entry is the default scene
```

## Adding a new scene

1. **Generate the background** (image stays where you generate it; copy into the assets folder):

    ```bash
    pnpm tsx scripts/generate-image.ts <id>
    # → outputs to ./tmp/image/<model>-<timestamp>.png
    ```

    Copy the result to `public/assets/image/scenes/<id>.png`.

2. **Write the level YAML** at `public/data/levels/<id>.yaml`:

    ```yaml
    title: The 11th Forest — <Name>
    background: assets/image/scenes/<id>.png
    imageSize: 2752x1536
    airWalls: []
    monsters: []
    dropSpawns: []
    materials: []
    ```

    All sections except `title` / `background` / `imageSize` are optional. `imageSize` MUST equal the image's native pixel size — Matter world bounds + air-wall coords are interpreted in this pixel space.

3. **Register the id** in `public/data/levels/index.yaml`:

    ```yaml
    levels:
        - sacred-forest-sanctuary
        - <id> # append at the end (order = render order)
    ```

4. **(Optional) override** for testing without touching the index:
    ```
    http://localhost:8080/?scene=<id>
    ```

That's it — no TS code changes. The same `LoadScene` class loads it.

## HUD bridge

Two pieces of scene state are pushed into the React HUD via `useGameStore`:

| Field            | When pushed                                                                      | Consumer                                     |
| ---------------- | -------------------------------------------------------------------------------- | -------------------------------------------- |
| `levelTitle`     | `setLevelTitle(level.title \|\| id)` once in `create()`                          | `SceneHubOverlay` (top-center amber)         |
| `levelElapsedMs` | `setLevelElapsedMs(now - levelStartAt)`, throttled to 5 Hz in `tickLevelClock()` | `SceneHubOverlay` (under title, white MM:SS) |

Both reset on shutdown via `setLevelElapsedMs(0)` when the next scene boots.

## Events emitted by `LoadScene`

| Event                 | Payload                                   | When                           |
| --------------------- | ----------------------------------------- | ------------------------------ |
| `level-loaded`        | `{ id, level }`                           | end of `create()`              |
| `current-scene-ready` | `this` (the scene)                        | end of `create()`              |
| `character-position`  | `{ x, y }`                                | per-frame while alive — tavern weapon-replace hub listens |
| `music:<id>` or `music:stop` | —                                   | if `level.music` set, or `MUSIC_STOP` if unset |
| `editor-open`         | listened by the scene (not emitted by it) | toggles HUD + debug rectangles |

The `music` event is **not** auto-emitted on every scene; it is only emitted by `LoadScene.create()` based on `level.music`. See [`AUDIOS.md`](./AUDIOS.md#the-bgm-singleton-cross-scene-cross-fade) for the singleton semantics that prevent two scenes from stacking BGM.

## Validation

`scripts/validate-levels.ts` runs at CI / pre-commit. It checks:

- Every `index.yaml` entry has a matching `data/levels/<id>.yaml` file (one-way: orphan files allowed as drafts).
- `level.imageSize` matches the image's actual pixel dimensions (so walls don't drift).

Run manually:

```bash
pnpm tsx scripts/validate-levels.ts
```

## What this design intentionally leaves out

- **Teleporter & Level Transition**: 传送门 (`teleporter.ts`) 提供了多场景间的平滑切换支持。走进 Teleporter 碰撞圈（支持设置 `targetScene`）会自动通过 `resolveAndRestart()` 切换至目标关卡，重置 HUD / 怪物并平滑承接存档状态。
- **Editor (air-wall drawing, teleporters, props placement, monster spawn placement)** lives behind the editor panel (`?editor=1`). The scene subscribes to `editor-open` to hide HUD overlays and show debug rectangles. See `src/editor/` and `docs/EDITOR.md`.
- **No `prompts/scenes/<id>.yaml`** anymore — AI regen prompts live inline in `level.prompt:` when used.
