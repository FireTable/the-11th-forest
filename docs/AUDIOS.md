# AUDIOS

SFX + music assets and the controller that plays them. Driven entirely by `EventBus` — modules just `emit('sfx:foo')` / `emit('music:bar')` and the controller responds.

## File layout

```
src/lib/audios/
├── schema.ts      # SfxSpecSchema, MusicSpecSchema, AudioIndexSchema, SoundSpecSchema
├── types.ts       # z.infer'd types
├── parser.ts      # parseAudioYaml / parseAudioIndex
├── loader.ts      # fetchAudioIndex, fetchAudioSfx, fetchAudioMusic
└── index.ts       # public barrel

src/game/audios/
├── logic.ts       # AudioController + loadAudioAssets + module-level BGM singleton
├── throttle.ts    # SfxThrottle (per-key min-gap gate)
└── visibility.ts  # visibilityAction — pause/resume tab-hide policy

public/data/audios/
├── index.yaml     # manifest of sfx + music ids
├── sfx/
│   ├── <id>.yaml  # one per sfx
│   └── …
└── music/
    ├── <id>.yaml  # one per music track
    └── …

public/assets/audio/
├── sfx/<id>.wav
├── music/<id>.mp3
└── CREDITS.md     # source attribution for every shipped asset
```

## YAML schemas

### `public/data/audios/sfx/<id>.yaml`

```yaml
kind: sfx
id: pickup-hp # REQUIRED — must match the filename (loader overwrites too)
name: Pickup HP
source: assets/audio/sfx/pickup-hp.wav
volume: 0.8 # 0..1, default 1
rate: 1 # playback rate, default 1
loop: false # default false
prompt:
    Soft magical healing chime pickup, anime RPG # AI regen hint
    # (used by scripts/elevenlabs-sfx.ts when present)
```

### `public/data/audios/music/<id>.yaml`

```yaml
kind: music
id: forest-ambient # REQUIRED
name: Forest Ambient
source: assets/audio/music/forest-ambient.mp3
volume: 0.4 # default 0.5
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

`id` is required at parse time (the event name `sfx:<id>` is derived from it; `kind` discriminates sfx vs music).

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
new AudioController(scene, sfxSpecs: Iterable<SfxSpec>, musicSpecs: Iterable<MusicSpec>)
```

Subscribes to EventBus in the constructor. The controller is a **pure sink** — it never auto-plays music on creation; the level YAML decides what to start via `EventBus.emit(MUSIC_EVENT(id))`.

### Static asset loader

```ts
loadAudioAssets(scene, specs: Iterable<SoundSpec>): void
```

Bulk-queues every `source:` via Phaser's loader. Call from `preload()` (scene). Returns nothing — the scene keeps its own spec map and hands it to the controller.

### Methods

| Method                                  | Purpose                                               |
| --------------------------------------- | ----------------------------------------------------- |
| `playSfx(id, opts?)`                    | play one-shot, respects `volume`/`rate`/`loop`. `opts.key` lets the throttle bucket differ from the sfx id (e.g. `monster:${id}` so different monsters don't share a window); `opts.throttleMs` overrides the default. |
| `playMusic(id)`                         | cross-fade to new track (`fadeIn`/`fadeOut` honoured) — see **BGM singleton** below |
| `stopMusic()`                           | stop currently-playing music (with `fadeOut`)         |
| `pauseMusic()` / `resumeMusic()`        | pause / resume (operates on the singleton sound)      |
| `setSfxVolume(v)` / `setMusicVolume(v)` | master sound volume                                   |
| `destroy()`                             | teardown — but the BGM singleton itself is **not** destroyed |

## The BGM singleton (cross-scene, cross-fade)

`src/game/audios/logic.ts` keeps two module-level globals:

```ts
let globalMusicId: string | null = null;
let globalMusicSound: Phaser.Sound.BaseSound | null = null;
```

`playMusic(id)` follows this flow:

1. **Same id already playing globally** (e.g. the previous scene set it and the new scene asks for the same track) → adopt ownership, **do not restart**. Otherwise two `Phaser.Sound.BaseSound` instances stack on top of each other during the cross-scene transition.
2. **AudioContext still locked** (browser autoplay policy) → defer the id in `pendingMusic`; Phaser emits `Phaser.Sound.Events.UNLOCKED` after the first user gesture and the controller retries the play then.
3. **Different music** (or none playing) → cross-fade: create the new sound at `volume: 0`, tween to `spec.volume` over `spec.fadeIn`, simultaneously tween the old sound down over `spec.fadeOut || AUDIO_DEFAULT_FADE_MS`, then `oldSound.destroy()` in `onComplete`. Update the globals.

`stopMusic` / `pauseMusic` / `resumeMusic` operate on `globalMusicSound` — whichever scene currently owns it.

`AudioController.destroy()` only clears the per-controller unsubscribe list (throttle + EventBus listeners). It does **not** destroy `globalMusicSound` — that's the singleton BGM that survives scene transitions; the next scene's controller adopts it via step (1).

The scene emits the level's chosen music on `create()`:

```ts
if (this.level.music) {
    EventBus.emit(MUSIC_EVENT(this.level.music));
} else {
    EventBus.emit(MUSIC_STOP); // silent scene — stop any previous BGM
}
```

This guarantees the singleton never leaks BGM into a scene that didn't ask for one. The singleton only survives scene transitions where the same id is requested.

## Events subscribed

| Event                       | When                                  |
| --------------------------- | ------------------------------------- |
| `sfx:<id>`                  | play that sfx (e.g. `sfx:pickup-hp`)  |
| `music:<id>`                | switch to that music track            |
| `music:stop`                | stop current track                    |
| `music:pause`               | pause                                 |
| `music:resume`              | resume                                |
| `dev:cheat:muted`           | dev Mute toggle (zero master volume)  |
| `Phaser.Sound.Events.UNLOCKED` | browser autoplay unlocked — play pendingMusic |

Event-name helpers (from `src/lib/constants.ts`):

```ts
SFX_EVENT(id); // → 'sfx:<id>'
MUSIC_EVENT(id); // → 'music:<id>'
MUSIC_STOP / MUSIC_PAUSE / MUSIC_RESUME; // string constants
```

Use these instead of string-concatenating in callers — keeps the prefix in one place.

## Events emitted

None — the audio module is a sink. (Music state is observable via `getCurrentMusicId()` if a test or debug surface needs it.)

## Adding a new sfx / music

### SFX

1. Drop the audio file at `public/assets/audio/sfx/<id>.wav` (mono, 44.1 kHz, 16-bit — see the conversion pattern in `scripts/elevenlabs-sfx.ts`).
2. Write `public/data/audios/sfx/<id>.yaml` matching the schema. The `id:` field must match the filename basename (the parser checks it). Optionally add a `prompt:` if you plan to regen via ElevenLabs.
3. Append `<id>` to `public/data/audios/index.yaml → sfx:`.
4. Reference from where it's triggered — add `sfx: <id>` to a weapon / monster / character / drop yaml, or emit it directly via `SFX_EVENT('<id>')`.

### Music

Same pattern under `public/data/audios/music/` and `index.yaml → music:`.

## Regenerating AI sfx

`scripts/elevenlabs-sfx.ts` reads the prompt from each sfx yaml and regenerates `public/assets/audio/sfx/<id>` via the ElevenLabs API.

```bash
pnpm tsx scripts/elevenlabs-sfx.ts                  # regenerate all from index
pnpm tsx scripts/elevenlabs-sfx.ts shotgun-shoot    # regenerate one
```

The script requires `ELEVENLABS_API_KEY` in `.env.local` (see `.env.example`). Free tier is ~50 generations/month, **non-commercial only** — upgrade to Starter before release.

**When the prompt is wrong**, edit the yaml's `prompt:` field and re-run. The script only generates files that are missing.

## Conventions

- **One yaml per asset.** Same rule as every other module.
- **`id:` is required** in the yaml (must match the filename basename).
- **Index drives preload.** Orphan yamls are ignored; missing index entries cause runtime `playSfx` to no-op.
- **`prompt:` is the AI regen hint.** Reading the actual audio file at runtime never reads this field.
- **SFX IDs use kebab-case** — `pickup-hp`, `monster-aggro`. Numbers / underscores work but stick to kebab for consistency.
- **`source:` is always relative to `public/`** — never absolute, never with `/public/` prefix. The loader resolves it.
- **Attribution lives in `public/assets/audio/CREDITS.md`** — append a new source row when adding a non-Mixkit / non-ElevenLabs asset.
- **SFX throttle windows** — multiple emitters often want overlapping instances (a shotgun shell + a machine gun). Use `opts.key` (e.g. `monster:${id}`) to bucket the throttle per source rather than per sfx id, otherwise the second emitter gets dropped.