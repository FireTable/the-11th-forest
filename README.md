# The 11th Forest

[English](README.md) · [简体中文](README-CN.md)

A top-down, anime-styled pixel art shooter built on Phaser 4. Fight through cursed gardens of the Eleventh Forest — where every petal hides a bullet and every silence hides a song.

![screenshot](screenshot.png)

## About

**The 11th Forest** is a top-down shooter with a hand-crafted pixel aesthetic and a moody, gothic-garden setting. You play a lone hunter drawn into a forest that shouldn't exist — a place where roses shoot back and the trees remember every name spoken under their shade.

- **Genre:** Top-down action shooter / Roguelite
- **Art:** Gothic garden anime pixel art
- **Camera:** Top-down, dynamic camera follow & lock
- **Status:** Alpha / Core gameplay systems & level editor complete

## Key Features

- **Data-Driven Architecture:** Levels, characters, monster AI, weapons/projectiles, drop items, and audio triggers are entirely driven by strictly validated YAML files.
- **Character Selection & Tavern Scene:** Multi-character support with unique voice lines and damage routing, tavern scene switching, and persistent save states.
- **Combat & AI Mechanics:** Matter.js physics integration, monster pathfinding using foot-based BodyBox offsets, knockback/stagger state machine, and custom weapon Z-depth layering.
- **Seamless Teleporter System:** Inter-scene travel handled via configurable Teleporters.
- **In-Browser Visual Level Editor:** Comprehensive built-in editor supporting air walls, monster placement, teleporter configuration, tile map module composition, and sprite animation slicing with direct local YAML file save API.
- **Integrated AI Generation Pipeline:** MiniMax AI audio/music generation and Google Gemini 3 Pro Image (Nano-banana 2) pixel art asset generation.

## Tech Stack

| Layer       | Choice                                                                             |
| ----------- | ---------------------------------------------------------------------------------- |
| Game engine | [Phaser 4](https://github.com/phaserjs/phaser)                                     |
| UI          | [React 19](https://react.dev)                                                      |
| Build       | [Vite 6](https://vite.dev)                                                         |
| Language    | [TypeScript 5.7](https://www.typescriptlang.org)                                   |
| Music       | [MiniMax](https://MiniMax.io) AI music generation                                  |
| Image gen   | [Google Nano-banana 2](https://ai.google.dev/gemini-api/docs) (Gemini 3 Pro Image) |

## Getting Started

Requirements: Node.js 18+. Package manager: **pnpm**.

```bash
pnpm install
pnpm dev          # dev server (sends anonymous usage ping)
pnpm dev-nolog    # dev server without the ping
pnpm build        # production build → dist/
```

Dev server defaults to `http://localhost:8080`.

## Project Structure

| Path                      | Description                                               |
| ------------------------- | --------------------------------------------------------- |
| `index.html`              | HTML shell + boot splash                                  |
| `src/main.tsx`            | React entry point                                         |
| `src/App.tsx`             | Top-level React component                                 |
| `src/PhaserGame.tsx`      | Phaser ↔ React bridge                                     |
| `src/game/`               | Game source, one directory per module                     |
| `src/game/main.ts`        | Phaser game config & boot                                 |
| `src/game/scenes/`        | `LoadScene` — one generic scene for all levels            |
| `src/lib/events/bus.ts`   | Cross-boundary event bus                                  |
| `src/store/game-store.ts` | HUD state + persisted save file                           |
| `public/data/`            | Level / monster / weapon / … YAML                         |
| `public/assets/`          | Static assets (sprites, audio)                            |
| `docs/`                   | Long-form docs — see [`docs/README.md`](./docs/README.md) |

## AI-Generated Music

The soundtrack is produced through the **MiniMax** AI music generation service. Each track is generated against a prompt keyed to an in-game mood (e.g. _“rose garden at dusk, slow piano over low strings”_) and dropped into `public/assets/audio/`.

To regenerate a track, call the MiniMax music API with the prompt stored in the matching `.prompt.json` next to the audio file.

## AI-Generated Art

Pixel art and other visual assets are produced through Google's **"Nano-banana 2"** (a.k.a. [Gemini 3 Pro Image](https://ai.google.dev/gemini-api/docs/image-generation)), a native multimodal image model. Prompts for each asset live as templates under [`prompts/`](./prompts/); generated images are dropped into [`public/assets/image/`](./public/assets/image/).

To regenerate an asset, call the Nano-banana 2 API at `https://generativelanguage.googleapis.com/v1beta` with the matching prompt template, then write the response into `public/assets/image/<name>.png`.

Configure the API key in `.env`:

```env
VITE_GEMINI_API_KEY=...
VITE_GEMINI_MODEL=gemini-3-pro-image
```

## Writing Code

Edit anything under `src/`. Vite hot-reloads on save.

There is no per-level scene class — `LoadScene` renders every level from its
YAML. To add a level, write `public/data/levels/<id>.yaml` and list the id in
`index.yaml`; see [`docs/SCENES.md`](./docs/SCENES.md) for the full walkthrough.

For day-to-day work on game data — adding a character, tuning monster HP, regenerating audio — see [`docs/SKILL.md`](./docs/SKILL.md). It walks the schema-first workflow, balance numbers, and the AI asset pipeline end to end.

## Documentation

Long-form design, mechanics, art, and tooling docs live in [`docs/`](./docs/), one topic per `UPPERCASE-ENGLISH.md` file. See [`docs/README.md`](./docs/README.md) for the full index.

Start with:

- [`docs/SCENES.md`](./docs/SCENES.md) — how a scene is loaded (file layout, `handle-fetch`, adding a new scene, monster spawn triggers, HUD bridge).
- [`docs/MODULES.md`](./docs/MODULES.md) — the yaml → schema → parser → loader → logic pattern every data-driven module follows.
- [`docs/SKILL.md`](./docs/SKILL.md) — how to maintain `public/data/` (schemas, balance, AI regen).

Per-module references:

- [`docs/WEAPONS.md`](./docs/WEAPONS.md) · [`docs/MONSTERS.md`](./docs/MONSTERS.md) · [`docs/CHARACTERS.md`](./docs/CHARACTERS.md) · [`docs/DROPS.md`](./docs/DROPS.md) · [`docs/AUDIOS.md`](./docs/AUDIOS.md) · [`docs/EVENTS.md`](./docs/EVENTS.md) · [`docs/PERSIST.md`](./docs/PERSIST.md) · [`docs/EDITOR.md`](./docs/EDITOR.md)

## License

MIT — see [LICENSE](./LICENSE).

> The original Phaser + React + TypeScript template is © Phaser Studio Inc., MIT licensed.
