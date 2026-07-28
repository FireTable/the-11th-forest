# SCENES

How a "scene" is loaded — the data flow, file layout, and runtime contract.

## TL;DR

Every scene is **three same-basename files**:

| File | Purpose | Read by |
|---|---|---|
| `public/assets/image/scenes/<id>.png` | Background image | Phaser |
| `public/data/levels/<id>.yaml` | Runtime level data | Game + Editor |
| `prompts/scenes/<id>.yaml` | AI generation template | `scripts/generate-image.ts` |

`<id>` is the kebab-case basename. There is no per-level code — a single generic `LoadScene` reads any of them.

The filename is the canonical id. **No `id` / `number` field in any of the three files.** Adding a scene = append to `public/data/levels/index.yaml` + create the two new files.

## File layout

```
public/
  assets/image/scenes/
    sacred-forest-sanctuary.png             # 1. background
  data/levels/
    index.yaml                              # 2. ordered manifest
    sacred-forest-sanctuary.yaml            # 2. per-level runtime data

prompts/scenes/
  sacred-forest-sanctuary.yaml              # 3. AI generation template

src/
  game/scenes/load-scene.ts                 # generic loader (one per game, not per scene)
  game/main.ts                              # resolves scene id, fetches Level, mounts Game
  lib/
    handle-fetch.ts                         # Node/browser unified fetch wrapper
    levels/
      types.ts                              # Level / AirWall / LevelIndex / parseImageSize
      parser.ts                             # sync pure parsing
      loader.ts                             # async fetchLevel / fetchLevelIndex
      index.ts                              # barrel
```

## Loading flow

```
src/game/main.ts:resolveScene()
    │
    ├──► fetchLevelIndex()      ──► fetch('/data/levels/index.yaml')
    │                             handle-fetch → Node: fs.readFileSync (public/data/levels/index.yaml)
    │                                            Browser: HTTP request
    │   parseLevelIndex(text) → first id
    │
    ├──► fetchLevel(id)         ──► fetch('/data/levels/<id>.yaml')
    │                             handle-fetch → Node: fs.readFileSync
    │                                            Browser: HTTP request
    │   parseLevelYaml(text, id) → Level
    │
    └──► new LoadScene(id, level)         # level is pre-fetched (Phaser init()
                                          # doesn't await async work)
         │
         ▼
    LoadScene.preload()  →  this.load.image('background', level.background)
    LoadScene.create()   →  render bg + air walls (red/short, blue/tall)
                            EventBus.emit('current-scene-ready', this)
```

## handle-fetch: the bridge

`src/lib/handle-fetch.ts` exports one function: `fetch`. Same signature as the global. The only thing it does in Node is rewrite `/data/*` paths to a filesystem read of `./public/data/*` and wrap the result in a `Response`. The browser sees a pass-through.

Why this matters:

- Vite **externalises** `node:*` modules in browser bundles. Any code that does `import { readFileSync } from 'node:fs'` blows up at runtime in the browser.
- Calling `fetch('/data/levels/X.yaml')` works in **both** runtimes because the wrapper handles the translation lazily (dynamic `import('node:fs')` only in Node, only on first call).
- Callers stay simple: `fetch('/data/...')`, no `if (browser) ... else ...`.

Code shape:

```ts
import { fetch } from '@/lib/handle-fetch';

const text = await (await fetch('/data/levels/<id>.yaml')).text();
```

This is the **only** approved way to read project resources in shared code (`src/`). Scripts under `scripts/` may use `node:fs` directly for non-`/data/*` reads (e.g. `prompts/scenes/<id>.yaml`). See CLAUDE.md rule #7.

## Scene id resolution

`src/game/main.ts` reads the scene id in this order:

1. **URL query** — `?scene=<id>` (debug-only, overrides everything)
2. **`index.yaml[0]`** — first entry in `public/data/levels/index.yaml`

URL override is for testing without editing the index. Default game launch picks the first listed scene.

## Adding a new scene

1. **Generate the background** (image stays in `prompts/scenes/<id>.yaml` for now — same flow as scene 1):
   ```bash
   pnpm tsx scripts/generate-image.ts sacred-forest-sanctuary
   # → outputs to ./tmp/image/<model>-<timestamp>.png
   ```
   Copy the result to `public/assets/image/scenes/<id>.png`.

2. **Write the level YAML** at `public/data/levels/<id>.yaml`:
   ```yaml
   title: The 11th Forest — <Name>
   background: assets/image/scenes/<id>.png
   imageSize: 2752x1536
   promptFile: prompts/scenes/<id>.yaml
   airWalls: []
   ```
   `imageSize` MUST equal the value in `prompts/scenes/<id>.yaml` — `scripts/validate-levels.ts` enforces this.

3. **Register the id** in `public/data/levels/index.yaml`:
   ```yaml
   levels:
     - sacred-forest-sanctuary
     - <id>                  # ← append at the end (order = render order)
   ```

4. **Validate**:
   ```bash
   pnpm tsx scripts/validate-levels.ts
   ```

5. **(Optional) override** for testing without touching the index:
   ```
   http://localhost:8080/?scene=<id>
   ```

That's it — no TS code changes. The same `LoadScene` class loads it.

## YAML schemas

### `public/data/levels/<id>.yaml` — runtime data

```yaml
title: string                          # human-readable, used in editor UI
background: string                     # path under public/, e.g. assets/image/scenes/X.png
imageSize: string                      # "WxH", MUST match prompts/scenes/<id>.yaml
promptFile: string                     # path to the AI prompt YAML
airWalls:                              # list, may be empty
  - id: string                         # unique within the level
    kind: tall | short                 # physical height, not gameplay role
    points:                            # polygon in image pixel space (implicitly closed)
      - [number, number]               # >=3 vertices; a rectangle is just 4 vertices
      - [number, number]
      - [number, number]

The legacy `{ x, y, width, height }` rectangle form is still accepted by the
parser and auto-migrated to a 4-vertex polygon — kept only so old level files
don't break. New levels should write the `points` form directly.

```

### `public/data/levels/index.yaml` — manifest

```yaml
levels:
  - <id>                               # ordered; first entry is the default scene
```

### `prompts/scenes/<id>.yaml` — AI template

```yaml
imageSize: 2752x1536                   # MUST match data/levels/<id>.yaml.imageSize
prompt: |                              # multi-line, fed directly to the model
  ...
negative: |                            # optional, fed as negative prompt
  ...
```

## Validation

`scripts/validate-levels.ts` runs at CI / pre-commit. It checks:

- Every `index.yaml` entry has a corresponding `data/levels/<id>.yaml` file (one-way: orphan files allowed as drafts)
- `level.imageSize` equals `prompt.imageSize`

Run manually:

```bash
pnpm tsx scripts/validate-levels.ts
```

## What this design intentionally leaves out

- **No `id` field** in any YAML — the filename is the id.
- **No `number` field** — render order comes from `index.yaml`.
- **No per-scene TS file** — `LoadScene` is generic.
- **No level transition logic** yet — only the boot path is wired.
- **Editor (air-walls draw, props placement)** lives behind the editor panel (`EDITOR_PANEL=1`, F2 toggle). See CLAUDE.md tasks #5–7.