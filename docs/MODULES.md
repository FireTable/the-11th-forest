# MODULES

The pattern every game module follows — schema → parser → loader → logic — and the conventions that keep them in sync. Per-module specifics live in their own docs:

- [`WEAPONS.md`](./WEAPONS.md)
- [`MONSTERS.md`](./MONSTERS.md)
- [`CHARACTERS.md`](./CHARACTERS.md)
- [`DROPS.md`](./DROPS.md)
- [`AUDIOS.md`](./AUDIOS.md)
- [`EVENTS.md`](./EVENTS.md)
- [`SCENES.md`](./SCENES.md) — levels / scene loading

## TL;DR

Every "thing" the player sees or fights is one **yaml file** with a fixed shape. The schema is the single source of truth — TypeScript types are auto-derived from it. Logic code never hardcodes numeric constants from yaml; it reads them at runtime.

```
public/data/<module>/<id>.yaml       # the data
public/data/<module>/index.yaml      # ordered list of ids
       ↓ fetch (handle-fetch: browser + Node)
src/lib/<module>/loader.ts           # async fetch
src/lib/<module>/parser.ts           # sync parse (uses js-yaml + Zod)
src/lib/<module>/schema.ts           # Zod schema (single source of truth)
src/lib/<module>/types.ts            # z.infer → TS types
src/lib/<module>/index.ts            # public API (re-exports)
       ↓
src/game/<module>/logic.ts           # runtime: pure helpers + Phaser controller
```

## File layout (one module)

```
src/lib/<module>/
├── schema.ts      # Zod schema — single source of truth
├── types.ts       # z.infer'd types + shared interfaces
├── parser.ts      # parse<Module>Yaml(text, id) → Spec
├── loader.ts      # async fetch<Module>(id) using handle-fetch
├── prefetch.ts    # collect all ids referenced by a level (optional)
└── index.ts       # public barrel — only this is imported from outside

src/game/<module>/
└── logic.ts       # pure helpers + a Controller class (Phaser-coupled)
                   # sometimes split: logic.ts + visual.ts + spawn-queue.ts etc.

public/data/<module>/
├── <id>.yaml      # one per entity (weapon / monster / drop / sound / level)
└── index.yaml     # manifest of ids
```

## Conventions

1. **Schema is the only source of truth.** TypeScript types are `z.infer<typeof XSchema>`. Add a yaml field → schema → type appears automatically.
2. **No `id` field in entity yaml.** The filename basename is the id (CLAUDE.md rule + SCENES.md).
3. **No magic numbers in `src/`.** Engine values (category bits, keycodes, HUD layout, cooldowns) → [`src/lib/constants.ts`](./../../src/lib/constants.ts). Per-entity values (HP, damage, range) → yaml.
4. **`handle-fetch` for shared code** (CLAUDE.md rule #7). Only `scripts/` may use `node:fs` directly.
5. **`src/lib/<module>/index.ts` is the public surface.** Other modules import from `@/lib/<module>`; they do not reach into `schema.ts` / `loader.ts` directly.
6. **Logic is split**: pure helpers (no Phaser, vitest-able) + a Controller class (Phaser-coupled, untestable in Node). TDD lands on the helpers.
7. **Module-to-module comms is `EventBus.emit('sfx:foo' | 'music:foo' | …)`.** Never import another module's controller to call its methods directly. See [`EVENTS.md`](./EVENTS.md).

## The yaml → runtime pipeline

```ts
// src/lib/<module>/loader.ts
import { fetch } from '@/lib/handle-fetch';
import { parse<Module>Yaml } from './parser';

export async function fetch<Module>(id: string): Promise<<Module>Spec> {
    const res = await fetch(`/data/<module>/${id}.yaml`);
    const text = await res.text();
    return parse<Module>Yaml(text, id);   // throws on schema mismatch
}
```

```ts
// src/game/scenes/scene.ts (the orchestrator)
const specs = await Promise.all(uniqueIds.map((id) => fetch<Module>(id)));
const specMap = new Map(uniqueIds.map((id, i) => [id, specs[i]]));
// hand specMap to controller
this.controller = new <Module>Controller(scene, this, specMap, ...);
```

The scene never reaches into yaml directly — it goes through `fetch<Module>`.

## Adding a new entity

1. Drop `public/data/<module>/<id>.yaml` matching the module's schema.
2. Append `<id>` to `public/data/<module>/index.yaml` (order = render order, first = default).
3. (Optional) Run `pnpm tsx scripts/validate-<module>.ts` if the module has a validator.
4. No TS code changes — the controller picks it up automatically.

## When to add new code

Only when the schema can't express the behaviour you need. Examples:

- A new trigger kind for monster spawns → added `MonsterTriggerSchema` + reducer (see [`MONSTERS.md`](./MONSTERS.md))
- Per-gender hurt sfx → added `CharacterSfxSchema.hurtMale/hurtFemale` + `resolveHurtSfx` (see [`CHARACTERS.md`](./CHARACTERS.md))
- New HUD position → top-center time → added `levelElapsedMs` to store + `LevelTimeHud` component

Rule of thumb: **add a yaml field before adding a code path.** Tweak the schema, fill in the spec, write the logic that reads it. Then the next entity gets it for free.

## Validators

| Script | What it checks |
|---|---|
| `pnpm tsx scripts/validate-levels.ts` | every `index.yaml` entry has a matching data file; `level.imageSize` matches the prompt yaml |

Most modules don't have a validator — Zod `.safeParse` at parse time is enough. Add a validator only for cross-file invariants (like level↔prompt alignment).