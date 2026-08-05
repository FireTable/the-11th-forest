# Editor

In-browser, dev-only editor for levels, characters, drops, monsters, weapons, and audio. Lives in the right-hand panel that appears when the app is loaded with `?editor=1`. Writes YAML straight to `public/data/**` so Vite triggers a full reload on save.

## Opening

```
http://localhost:8080/?editor=1
```

Click the **Editor** button (bottom-left of the canvas) to toggle the side panel. The dev server mounts `/api/editor/*` (see [`vite/plugins/editor-api.mjs`](../vite/plugins/editor-api.mjs)); without the dev server, the panel can't save.

## Layout

```
┌─ Top tabs ───────────────────────────────────────────────┐
│ Scenes │ Chars │ Drops │ Mobs │ Weaps │ Audio            │
├─ Scene sub-tabs (only when Scenes is selected) ───────────┤
│ Scenes │ Background │ Settings │ Monsters │ Air walls │  │
│ Materials                                                │
├─ Body ────────────────────────────────────────────────────┤
│ (selected section UI)                                    │
└───────────────────────────────────────────────────────────┘
```

Top-tabs own their own list + per-item expansion. Scene sub-tabs share the currently-loaded level state; the **bottom Save** button persists whichever sub-tab mutated it.

---

## Tabs

### Scenes

Three pieces of state, three sub-tabs.

#### Scenes sub-tab

List every entry in [`public/data/levels/index.yaml`](../public/data/levels/index.yaml) with a `New` button. Clicking a row restarts Phaser in-process via [`resolveAndRestart()`](../src/lib/phaser-game.ts) and jumps to that scene — no page reload. `New` creates an empty yaml + appends to the index, then jumps to it.

#### Background sub-tab

Replace the scene PNG. Upload triggers `split-sheet.ts` only if you target the materials folder; for scenes, it just writes the file and reads natural size via `pngjs`. If the new size differs from `imageSize`, a confirm dialog asks before patching both fields.

#### Settings sub-tab

Top-level level fields not covered elsewhere: **title** (HUD), **prompt** (AI regen), **music** id, **pixelLighting** flag, **character** id + **characterSpawn** (facing + x + y), **dropSpawns** (level-level drops, distinct from monster drops). All edits flush through the bottom Save button.

#### Monsters sub-tab

Sortable list of `MonsterSpawn` rows. Per row: type (dropdown from `data/monsters/index.yaml`), waveId, x/y, optional trigger (time/clear + delayMs + waveId). Wave auto-numbering: a new spawn inherits the previous row's waveId.

#### Air walls sub-tab

Polygon wall editor. Toggle "Draw on canvas" then click vertices on the Konva overlay; clicking the first vertex closes the polygon. Per-wall kind dropdown (tall/short) and delete.

#### Materials sub-tab

Scene-placed materials list (with inspector) + a library of every folder under `assets/image/materials/`. Click a tile to place it at scene center; click an existing item to inspect/edit mode/scale/rotation/flip.

### Chars

List of every entry in [`public/data/characters/index.yaml`](../public/data/characters/index.yaml). Click a row to expand an inline form covering **Identity** (name + gender + description) → **Stats** → **Body** → **Dodge** → **WeaponMax** → **Hotbar** (weapon id list with ✕) → **Sprite** (upload + grid + scale + imageSize) → **Anims** (visual frame picker with chip-based range picking) → **SFX** (per-character audio identity) → **AI prompt**.

The character spec's `id:` field is required and must match the filename basename — the editor surfaces a validation error if the two diverge.

The sprite upload endpoint shells out to [`scripts/split-sheet.ts`](../scripts/split-sheet.ts) with the chroma-key pipeline; the returned natural size back-fills `sprite.texture`, `imageSize`, and the grid defaults.

### Drops / Mobs / Weaps / Audio

All four use the same generic [`ModuleShell`](../src/editor/sections/modules.tsx) — list of ids from the module's index file, click-to-expand inline form. New entries open a `New` dialog, append to the index, and expand the new row.

| Tab             | Form fields (covered)                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Drops           | Identity, Effect (instant / refill-ammo / weapon — discriminated), Audio (sfx + throttle), Visual (size, tint), Sprite (texture / grid / scale / offset / script), Anims, AI prompt                                                                                                                                                                                                                                                                                                          |
| Mobs (Monsters) | Identity, Body, Stats, SFX (hit/death/aggro + throttleMs), Drop table (dropId + chance), Sprite, Anims, AI prompt                                                                                                                                                                                                                                                                                                                                                                              |
| Weaps (Weapons) | Identity, Kind toggle (ranged/melee — auto-prunes projectile vs hitWidth/hitHeight), Combat (damage/cooldownMs/range/clipSize/reloadTimeMs/bulletsPerShot), Projectile visual (radius/width/height/color), Bullet (texture/type/speed/scale/color/beamWidth/beamDuration/anchor/rotationOffset/spawnOffset), Weapon visual (texture/scale/orbitRadius/anchor/muzzleOffset/recoilDistance/recoilDuration/swingAngle/rotationOffset), SFX (shoot/dryFire/bulletWall/reloadStart/reloadFinish + throttleMs), AI prompt |
| Audio           | SFX / Music sub-tabs. Identity, Source, Playback (volume + rate + loop for SFX, volume + fadeIn/Out for Music), AI prompt                                                                                                                                                                                                                                                                                                                                                                       |

---

## Persistence

Every save flows through the dev plugin's `/api/editor/*` endpoints. The plugin lives at [`vite/plugins/editor-api.mjs`](../vite/plugins/editor-api.mjs). Endpoints:

| Endpoint                                   | Module                                   | Validates with                                   |
| ------------------------------------------ | ---------------------------------------- | ------------------------------------------------ |
| `save-level`                               | Levels                                   | `SaveLevelSchema` (hand-mirror of `LevelSchema`) |
| `save-monsters`                            | Levels (monsters only)                   | array shape only                                 |
| `save-character`                           | Characters                               | `CharacterSpecSaveSchema`                        |
| `save-module-spec`                         | Drops / Monsters / Weapons / SFX / Music | `MODULE_SCHEMAS[slug]`                           |
| `create-module-spec`                       | Drops / Monsters / Weapons / SFX / Music | `MODULE_SCHEMAS[slug]`                           |
| `create-character`                         | Characters                               | hardcoded template only                          |
| `create-scene`                             | Levels                                   | id + title shape only                            |
| `upload-scene-image`                       | Levels                                   | PNG data-URL only                                |
| `upload-character-sprite`                  | Characters                               | runs `split-sheet.ts` subprocess                 |
| `upload-material` / `delete-material-item` | Materials                                | id pattern + filesystem                          |
| `list-*`                                   | (all)                                    | read-only                                        |

### Server-side validation

Every save endpoint that accepts a typed spec parses it through a hand-mirrored Zod schema in the plugin before writing to disk. The mirrors live in the same file (search for `*SaveSchema`) and are kept in sync with [`src/lib/<module>/schema.ts`](../src/lib/) — **drift risk** if you add a field to the TS schema without mirroring it in the plugin. Saving a payload that includes a new field with no mirror fails with HTTP 400 and a `validation failed:` error message naming the unrecognised key.

This is the safety net: a typo in the panel or a future divergence can't silently write YAML the game refuses to load. The mirror is verbose by design — the alternative (single source of truth) would mean extracting the schemas into a `.mjs` file the TS layer can also import; that's a larger refactor and not done yet.

### Round-trip semantics

The editor always sends the **full spec** for the entity it's editing. Server-side YAML serialisation mirrors the loader's parsing shape (in `src/lib/editor/yaml.ts` for levels, otherwise straight `js-yaml`). Fields the editor doesn't expose (e.g. `sprite`/`anims` on drops, `visual`/`bullet` on older weapons) are preserved verbatim on save because the full spec reaches the server — they're just not user-editable.

Caveat: `New` templates only seed the fields the form knows about. New entities won't carry optional blocks (`sprite`, `anims`, `prompt`, etc.) until they're added by hand or via upload.

### File-upload flows

- **Scene background**: write PNG to `assets/image/scenes/<id>.png`, return natural size + previous size. The editor decides whether to update `imageSize`.
- **Character sprite**: write to `tmp/editor-uploads/<id>-<ts>.png`, shell out to `pnpm tsx scripts/split-sheet.ts` with `--in-place --id=<id>`, read natural size of the processed output, return path + size. Editor fills `sprite.*` + `imageSize`.
- **Material tile**: write to `assets/image/materials/<folder>/temp-upload-raw.png`, shell out to `split-sheet.ts --append --no-recompose`, clean up temp files.

The tavern uses one `tavern` materials folder for the level's decorative props; other levels can introduce their own folder under `assets/image/materials/`.

## Audio tab specifics

The Audio tab is a single tab with **two sub-tabs**: SFX and Music. Each sub-tab lists the ids from the corresponding `public/data/audios/<kind>/` directory, sorted by index order. Click an entry to expand the form:

- **SFX**: `volume` (0..1), `rate` (default 1), `loop` (default false). Source file is shown but not editable in the panel — drop a new file at the source path and re-trigger.
- **Music**: `volume` (default 0.5), `fadeIn` ms, `fadeOut` ms.

The shared `prompt:` AI-regen field sits at the bottom; the `scripts/elevenlabs-sfx.ts` regen pipeline reads it (see [`AUDIOS.md`](./AUDIOS.md#regenerating-ai-sfx)).

---

## Known gaps / future work

- **No `/api/editor/list-monsters-as-monsters-yaml`** — monsters.tsx uses the generic `list-module` endpoint; fine, but the module slug list lives in the plugin rather than the data index.
- **Field-level edits don't deep-merge** — partial updates replace the whole entity. Currently fine because the editor always sends the full spec, but if you add a partial-update path, validate the partial through the schema before merging.
- **No undo / no diff preview**. Every save writes immediately; the `pnpm dev` HMR won't undo a malformed write.
- **Module CRUD schemas are hand-mirrored in the plugin**. Single-source-of-truth refactor (extract to `.mjs`) would eliminate drift risk but is bigger work.

---

## Tests + manual smoke

```
pnpm type-check     # tsc --noEmit
pnpm test           # vitest run
```

The editor has no vitest coverage of its own; the form is exercised manually via chrome MCP (e.g. `mcp__chrome-devtools__list_pages`, `navigate_page`, `take_snapshot`, `click`, `fill`, `evaluate_script`). Round-trip is verified by inspecting `public/data/<module>/*.yaml` against `public-bk/` after each editor session.
