# Conventions

How we build The 11th Forest — read this before adding code.

## TDD (Test-Driven Development)

For every new function or module:

1. **Write the test first.** Add a `*.test.ts` under `tests/`, mirroring the source path (`src/<area>/<Module>.ts` → `tests/<area>/<Module>.test.ts`).
2. **Implement minimally.** Only enough code to make the test pass — no speculative features, no "for later" hooks.
3. **Verify before moving on.** Both `pnpm test` and `pnpm type-check` must be green before touching the next piece.

**Functions stay small.** If a helper grows past ~50 lines or starts branching heavily, split it.

## File Organization

- One module per file. Single responsibility.
- Cap at **~1000 lines per file**. If a file approaches the cap, split it before continuing.
- Tests mirror source tree one-to-one.
- Group by concern: `src/game/scenes/`, `src/debug/sections/`, `src/debug/api/`, etc.
- **`src/lib/`** — shared functions, organized by module:
    ```
    src/lib/
      debug/   # debug panel helpers (air-wall model, sprite catalog, AI client)
      game/    # shared game logic (e.g. math, pathing)
      ui/      # shared UI primitives
    ```
    `src/lib/` is the bottom layer. Higher layers (`src/game/`, `src/debug/`, `src/components/`) depend on `lib/`; never the reverse. Each helper gets a sibling `*.test.ts` under `tests/lib/`.

## Commit Hygiene

A pre-commit hook runs automatically on every `git commit`:

1. `lint-staged` — Prettier + ESLint on staged files only
2. `tsc --noEmit` — full-project type check
3. `vitest run` — full test suite

Bypass only when there's a real reason: `git commit --no-verify`.

## Tooling Quick Reference

| Task         | Command             |
| ------------ | ------------------- |
| Run tests    | `pnpm test`         |
| Watch tests  | `pnpm test:watch`   |
| Type-check   | `pnpm type-check`   |
| Format       | `pnpm format`       |
| Check format | `pnpm format:check` |
| Lint         | `pnpm lint`         |
| Lint + fix   | `pnpm lint:fix`     |
