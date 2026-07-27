# CLAUDE.md

Quick context for working on **The 11th Forest** (第十一号森林) — a top-down, anime-styled pixel art shooter on Phaser 4 + React + Vite + TypeScript. AI image gen via Google's "Nano-banana 2"; AI music via MiniMax.

## Where to look

| Want to know about…                          | Read                                                          |
|----------------------------------------------|---------------------------------------------------------------|
| Project overview, tech stack, getting started| [`README.md`](./README.md) · [`README-CN.md`](./README-CN.md) |
| Coding rules (TDD, file size, layout)        | [`docs/CONVENTIONS.md`](./docs/CONVENTIONS.md)                |
| Game design / mechanics / art direction      | [`docs/README.md`](./docs/README.md) (index)                  |
| A specific module's contract                 | its sibling `*.test.ts` under `tests/`                       |

## Hard rules

1. **TDD.** Write tests first, implement minimally, `pnpm test` + `pnpm type-check` green before moving on.
2. **One module per file.** Cap at ~1000 lines; split before hitting the cap.
3. **Imports use the `@/...` alias**, never relative paths.
4. **Shared code lives in `src/lib/<module>/`** with a sibling test under `tests/lib/<module>/`.

## Commands

| Task        | Command            |
|-------------|--------------------|
| Dev         | `pnpm dev`         |
| Tests       | `pnpm test`        |
| Type-check  | `pnpm type-check`  |
| Format      | `pnpm format`      |
| Lint        | `pnpm lint`        |

Pre-commit hook runs `lint-staged` → `tsc --noEmit` → `vitest run` automatically.

## Style

- Lazy / minimal: smallest working diff wins. No speculative abstractions or deps.
- Match the surrounding code (4-space indent, single quotes, trailing commas — see `.prettierrc.json`).
- See [`docs/CONVENTIONS.md`](./docs/CONVENTIONS.md) for the full ruleset.