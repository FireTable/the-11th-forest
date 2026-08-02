# AUDIOS

SFX + music assets and the controller that plays them. Driven entirely by `EventBus` — modules just `emit('sfx:foo')` / `emit('music:bar')` and the controller responds.

## File layout

```
src/lib/audios/
├── schema.ts      # SfxSpecSchema, MusicSpecSchema, AudioIndexSchema
├── types.ts       # z.infer'd types
├── parser.ts      # parseAudioYaml / parseAudioIndex
├── loader.ts      # fetchAudioIndex, fetchAudioSfx, fetchAudioMusic
└── index.ts       # public barrel

src/game/audios/
└── logic.ts       # AudioController + loadAudioAssets

public/data/audios/
├── index.yaml     # manifest of sfx + music ids
├── sfx/
│   ├── <id>.yaml  # one per sfx
│   └── …
└── music/
    ├── boss-arena.yaml
    └── forest-ambient.yaml

public/assets/audio/
├── sfx/<id>.wav
├── music/<id>.mp3
└── CREDITS.md     # source attribution for every shipped asset
```

## YAML schemas

### `public/data/audios/sfx/<id>.yaml`

```yaml
kind: sfx
id: pickup-hp # optional; loader overwrites with filename
name: Pickup HP
source: assets/audio/sfx/pickup-hp.wav
volume: 0.8 # 0..1, default 1
rate: 1 # playback rate, default 1
loop: false # default false
prompt:
    Soft magical healing chime pickup, anime RPG # AI regen prompt
    # (used by scripts/elevenlabs-sfx.ts when present)
```

### `public/data/audios/music/<id>.yaml`

```yaml
kind: music
id: forest-ambient
name: Forest Ambient
source: assets/audio/music/forest-ambient.mp3
volume: 0.4
fadeIn: 1500 # ms, default 0
fadeOut: 1000 # ms, default 0
prompt:
    'Calm iyashikei anime forest ambience, lo-fi peaceful soundtrack for magical forest exploration.
    Designed for seamless looping: the final chord resolves and decays back into the same motif as the opening.
    …'
```

### `public/data/audios/index.yaml`

```yaml
sfx:
    - assault-rifle-shoot
    - shotgun-shoot
    - player-hurt-female
    - player-hurt-male
    # … one entry per shipped sfx
music:
    - forest-ambient
    - boss-arena
```

The loader iterates the `sfx:` and `music:` lists in order. **Only ids in this file get preloaded** — orphan yamls are silently ignored at load time.

## Public API (`src/lib/audios/index.ts`)

```ts
import {
    parseAudioYaml,
    parseAudioIndex,
    fetchAudioIndex,
    fetchAudioSfx,
    fetchAudioMusic,
    type AudioIndex,
    type SfxSpec,
    type MusicSpec,
    type SoundSpec,
} from '@/lib/audios';
```

## Logic — `AudioController` (in `src/game/audios/logic.ts`)

```ts
new AudioController(scene, index: AudioIndex)
```

Subscribes to EventBus in the constructor. Auto-plays `index.music[0]` on creation (with `fadeIn`).

### Static asset loader

```ts
loadAudioAssets(scene, index, onProgress?) → Record<string, SfxSpec | MusicSpec>
```

Bulk-loads every `source:` via Phaser's loader. Call this from `preload()` (scene) or before constructing the controller. Returns the spec map ready to hand to the controller.

### Methods

| Method                                  | Purpose                                               |
| --------------------------------------- | ----------------------------------------------------- |
| `playSfx(id)`                           | play one-shot, respects `volume`, `rate`, `loop`      |
| `playMusic(id)`                         | cross-fade to new track (`fadeIn`/`fadeOut` honoured) |
| `stopMusic()`                           | stop currently-playing music (with `fadeOut`)         |
| `pauseMusic()` / `resumeMusic()`        | pause / resume                                        |
| `setSfxVolume(v)` / `setMusicVolume(v)` | per-bus volume (master)                               |
| `destroy()`                             | teardown                                              |

## Events subscribed

| Event          | When                                 |
| -------------- | ------------------------------------ |
| `sfx:<id>`     | play that sfx (e.g. `sfx:pickup-hp`) |
| `music:<id>`   | switch to that music track           |
| `music-stop`   | stop current track                   |
| `music-pause`  | pause                                |
| `music-resume` | resume                               |

Event-name helpers (from `src/lib/constants.ts`):

```ts
SFX_EVENT(id); // → 'sfx:<id>'
MUSIC_EVENT(id); // → 'music:<id>'
MUSIC_STOP / MUSIC_PAUSE / MUSIC_RESUME;
```

Use these instead of string-concatenating in callers — keeps the prefix in one place.

## Events emitted

None — the audio module is a sink.

## Adding a new sfx / music

### SFX

1. Drop the audio file at `public/assets/audio/sfx/<id>.wav` (mono, 44.1 kHz, 16-bit — see the conversion pattern in `scripts/elevenlabs-sfx.ts`).
2. Write `public/data/audios/sfx/<id>.yaml` matching the schema. Optionally add a `prompt:` if you plan to regen via ElevenLabs.
3. Append `<id>` to `public/data/audios/index.yaml → sfx:`.
4. Reference from where it's triggered — add `sfx: <id>` to a weapon / monster / character / drop yaml, or emit it directly via `SFX_EVENT('<id>')`.

### Music

Same pattern under `public/data/audios/music/` and `index.yaml → music:`.

## Regenerating AI sfx

`scripts/elevenlabs-sfx.ts` reads the prompt from each sfx yaml and regenerates `public/data/audio/<id>` via the ElevenLabs API.

```bash
pnpm tsx scripts/elevenlabs-sfx.ts                  # regenerate all from index
pnpm tsx scripts/elevenlabs-sfx.ts shotgun-shoot    # regenerate one
```

The script requires `ELEVENLABS_API_KEY` in `.env.local` (see `.env.example`). Free tier is ~50 generations/month, **non-commercial only** — upgrade to Starter before release.

**When the prompt is wrong**, edit the yaml's `prompt:` field and re-run. The script only generates files that are missing.

## Conventions

- **One yaml per asset.** Same rule as every other module.
- **Index drives preload.** Orphan yamls are ignored; missing index entries cause runtime `playSfx` to no-op.
- **`prompt:` is the AI regen hint.** Reading the actual audio file at runtime never reads this field.
- **SFX IDs use kebab-case** — `pickup-hp`, `monster-aggro`. Numbers / underscores work but stick to kebab for consistency.
- **`source:` is always relative to `public/`** — never absolute, never with `/public/` prefix. The loader resolves it.
- **Attribution lives in `public/assets/audio/CREDITS.md`** — append a new source row when adding a non-Mixkit / non-ElevenLabs asset.
