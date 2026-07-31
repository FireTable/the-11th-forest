# CLAUDE.md

Quick context for working on **The 11th Forest** — a top-down, anime-styled pixel art shooter on Phaser 4 + React + Vite + TypeScript. AI image gen via Google's "Nano-banana 2"; AI music via MiniMax.

## Where to look

| Want to know about…                           | Read                                                          |
| --------------------------------------------- | ------------------------------------------------------------- |
| Project overview, tech stack, getting started | [`README.md`](./README.md) · [`README-CN.md`](./README-CN.md) |
| Coding rules (TDD, file size, layout)         | [`docs/CONVENTIONS.md`](./docs/CONVENTIONS.md)                |
| Game design / mechanics / art direction       | [`docs/README.md`](./docs/README.md) (index)                  |
| A specific module's contract                  | its sibling `*.test.ts` under `tests/`                        |
| Loading project resources (YAML, JSON, …)     | [`src/lib/handle-fetch.ts`](./src/lib/handle-fetch.ts)         |
| Engine / structural constants (CAT, KEY, HUD…) | [`src/lib/constants.ts`](./src/lib/constants.ts)               |

## Hard rules

1. **TDD.** Write tests first, implement minimally, `pnpm test` + `pnpm type-check` green before moving on.
2. **One module per file.** Cap at ~1000 lines; split before hitting the cap.
3. **Imports use the `@/...` alias**, never relative paths.
4. **Shared code lives in `src/lib/<module>/`** with a sibling test under `tests/lib/<module>/`.
5. **Docs are English.** `docs/*.md`, `CLAUDE.md`, `README.md` — all English. Only `README-CN.md` may be Chinese.
6. **Commits use [Conventional Commits](https://www.conventionalcommits.org/).** `<type>(<optional-scope>): <subject>` — `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `style`, `perf`. English subject, ≤72 chars, imperative mood, no trailing period.
7. **Resource loading goes through `handle-fetch`.** When reading project resources (level YAML, prompt YAML, any future JSON / asset), import `fetch` from [`src/lib/handle-fetch.ts`](./src/lib/handle-fetch.ts). Never use `node:fs` / `node:url` / `node:path` directly in shared code. Scripts under `scripts/` may use `node:fs` for non-`/data/*` resources (e.g. prompt YAMLs). Reason: Vite externalises `node:*` modules; bundling them into browser code breaks at runtime. The `handle-fetch` wrapper handles both runtimes via lazy dynamic import.
8. **The dev server is a shared resource.** The user keeps `pnpm dev` running on port 8080. Never start a duplicate dev server and never kill the existing process on port 8080. To verify a change, `curl http://localhost:8080/...` (or whichever port the user is on) directly. If you started a stale dev server on a different port during earlier debugging, clean up only your own process — leave 8080 alone.
9. **UI = shadcn + Tailwind + lucide.** Use shadcn/ui components from `src/components/ui/` (button, input, select, …). Style with Tailwind utility classes inline on the component — do **not** create new `.css` files for component styling. Icons come from `lucide-react`. Existing legacy CSS (e.g. `.button`) may remain but new UI should not add more.

10. **We're on Phaser v4.** If an API doesn't behave like a v3 tutorial suggests, query the Phaser v4 source/docs before assuming it works — v4 changed a few APIs (e.g. how `Matter.Body.create` handles vertices, scene-level pointer events, default ESM exports). For "any-click-anywhere", bind directly on the Phaser canvas DOM rather than `scene.input`.

11. **Constants belong to one of two homes — pick the right one.**
    - **Module YAML** when the value is *game data* that could change per character / weapon / drop / monster (e.g. character body half-extents, dodge tuning, drop visual, weapon projectile visuals, monster HP/moveSpeed). One YAML per entity, no `id` field, validator in `src/lib/<module>/parser.ts`.
    - **`src/lib/constants.ts`** when the value is *engine / structural* (physics category bits, keycodes, shared HUD layout + theme colours, render knobs, contact-damage cooldown, etc.). Group by module prefix (`CAT_*`, `KEY_*`, `HUD_*`, `COMBAT_*`, `RENDER_*`) and keep one prefix block per region with a `// ─── … ───` comment header.
    - Never inline a magic constant in a game file if it belongs to either bucket above. If it's truly single-use (only ever referenced once in one block of code) — leave it inline; the test is "would another module or a future iteration need to read or change this?" If yes, it goes to YAML or `lib/constants.ts`, not the call site.
12. **Each module owns its own concerns.** If a module is the source of truth for an asset or behaviour, the related loading, registration, animation driving, cleanup, etc. all live in that module's directory — not in the scene, orchestrator, or another module. Scene / orchestrator code dispatches *into* the module; the module owns the *how*. Example: a character's sprite-sheet `load.spritesheet` + `anims.create` calls live in `src/game/characters/`, and the scene's `preload`/`create` only delegate — they don't reach in to set sprite keys, register anims, or drive transitions themselves. Reason: per-entity logic scattered across files is the classic "where do I even look for this bug" codebase — there should be one place per concern.

## Commands

| Task       | Command           |
| ---------- | ----------------- |
| Dev        | `pnpm dev`        |
| Tests      | `pnpm test`       |
| Type-check | `pnpm type-check` |
| Format     | `pnpm format`     |
| Lint       | `pnpm lint`       |

Pre-commit hook runs `lint-staged` → `tsc --noEmit` → `vitest run` automatically.

## Style

- Lazy / minimal: smallest working diff wins. No speculative abstractions or deps.
- Match the surrounding code (4-space indent, single quotes, trailing commas — see `.prettierrc.json`).
- See [`docs/CONVENTIONS.md`](./docs/CONVENTIONS.md) for the full ruleset.
