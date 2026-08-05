# MONSTERS

NPC enemies with AI, pathfinding, weapons, drops, and trigger-gated spawns.

## File layout

```
src/lib/monsters/
├── schema.ts      # MonsterSpecSchema, MonsterTriggerSchema, DropRefSchema, SpriteSchema, AnimSpecSchema
├── types.ts       # z.infer'd types
├── parser.ts      # parseMonsterYaml(text, id) → MonsterSpec
├── loader.ts      # async fetchMonster(id) via handle-fetch
├── prefetch.ts    # collect monster ids referenced by level + their weapon ids
└── index.ts       # public barrel

src/game/monsters/
├── logic.ts            # PathfindingService + pure AI helpers (distBetween, decideAIState, …)
├── monster.ts          # Monster class + MonsterController
├── path-debug-overlay.ts # Dev path-debug rectangles (toggled via 'path-debug-visible')
└── spawn-queue.ts      # Pure reducer for trigger-gated spawns

public/data/monsters/
├── index.yaml
├── drone.yaml
├── gunner.yaml
├── stalker.yaml
├── sniper.yaml
├── warden.yaml
└── keeper.yaml
```

## YAML schema — `public/data/monsters/<id>.yaml`

```yaml
id: drone # optional; loader overwrites with filename
name: Thorn Drone
imageSize: 2048x2048 # AI-gen template size, optional (regex /^\d+x\d+$/)
prompt: | # AI image-gen template (chroma-key sprite sheet)

hp: 160
moveSpeed: 4 # Matter velocity (tunable range ~3..8 in current set)

body: # half-extents, used by Matter rectangle; defaults to 14x14
    halfW: 20
    halfH: 20

weaponId: plasma-sword # id from public/data/weapons/ — required

sfx: # all optional — controller falls back to global ids
    hit: monster-hit
    death: monster-death
    aggro: monster-aggro
    throttleMs: 80 # min gap between hit-SFX plays for this monster id

drops: # rolled on death; chance 0..1
    - dropId: hp-shard
      chance: 0.4
    - dropId: sp-fragment
      chance: 0.3
    - dropId: overcharge-core
      chance: 0.15

sprite: # optional; debug rectangle used if absent
    texture: assets/image/monsters/drone.png
    grid: { rows: 4, cols: 4 }
    scale: 1.0
    offset: { left: 0, bottom: 4 } # also accepts { x, y }
    script: # pixel-art post-process (chroma-key + downsample)
        downsample: 4
        colors: 32
        pad: 2

anims: # required when sprite is set; common keys: idle / move / hit / death
    idle:   { frames: [0, 3],   frameRate: 6,  repeat: -1 }
    move:   { frames: [4, 7],   frameRate: 10, repeat: -1 }
    hit:    { frames: [8, 11],  frameRate: 12, repeat: 0 }
    death:  { frames: [12, 14], frameRate: 10, repeat: 0 }
```

`AnimSpecSchema.frames` is a 2-tuple `[start, end]` with `end >= start`. Each common anim (idle / move / hit / death) is laid out as one row of the sprite sheet so the controller can play them straight from `frames`.

`MonsterTrigger` (used on the level, not on the monster itself) is documented in [`SCENES.md`](./SCENES.md#spawn-triggers).

## Public API (`src/lib/monsters/index.ts`)

```ts
import {
    parseMonsterIndex,
    parseMonsterYaml,
    fetchMonster,
    fetchMonsterIndex,
    type MonsterSpec,
    type MonsterIndex,
    type DropRef,
    type SpriteSpec,
    type AnimSpec,
} from '@/lib/monsters';
```

## Logic

### `Monster` class (`src/game/monsters/monster.ts`)

Single-instance runtime object. Owns: Matter body, sprite, debug rectangle, `WeaponVisualController`, `StatusHud` (HP bar), drops table, AI state (`idle | aggroed | attack | hit | dying | dead`).

Constructor: `(scene, spec, weapon, x, y, waveId?)`. The `waveId` tag flows in from the level spawn entry (see spawn-queue below).

### `MonsterController` (in `src/game/monsters/monster.ts`)

Orchestrator. Owns:

- `monsters: Monster[]` — currently alive
- `pendingSpawns: { pending: PendingSpawn; spec; weapon }[]` — wave-triggered spawns waiting for their fire condition
- `projectiles: MonsterProjectile[]`
- `pathfinder?: PathfindingService`

Constructor:

```ts
new MonsterController(scene, spawns, playerBody, cb, pathfinder?)
```

Where `spawns: { spec; weapon; x; y; trigger?: MonsterTrigger; waveId? }[]`. The `level.monsters` array maps to this shape in `src/game/scenes/scene.ts` after preloading each unique monster spec + its weapon.

Key methods:

| Method                            | Purpose                                                                       |
| --------------------------------- | ----------------------------------------------------------------------------- |
| `update(time)`                    | per-frame: advance spawn queue, pathfinding, AI tick, attack, projectile sync |
| `applyBulletDamage(dmg, hitBody)` | called by WeaponController when player bullet hits monster body               |
| `setDebugVisible(v)`              | toggle green outline rectangles                                               |
| `destroy()`                       | teardown all monsters + projectiles                                           |

Internal methods:

- `advancePendingSpawns(time)` — calls `advanceSpawnQueue` and instantiates fired monsters
- `performAttack(monster, dirToPlayer)` — ranged or melee based on `weapon.projectile`
- `bindCollisions()` — Matter collisionstart handler for `monster-projectile`, `monster-melee`, `monster` (body) ↔ player
- `damagePlayerFromMelee(meleeBody)`, `damagePlayerFromContact()` — both go through the same cooldown (`COMBAT_PLAYER_DAMAGE_COOLDOWN_MS`)

### Spawn queue (`src/game/monsters/spawn-queue.ts`)

Pure reducer, vitest-covered. The controller passes `{ now, aliveSnapshot }` and gets back `{ fired, remaining }`.

```ts
interface PendingSpawn {
    index: number;             // original level entry index
    type: string;
    x: number;
    y: number;
    trigger: { kind: 'time' | 'clear'; delayMs: number; waveId?: string };
    waveId?: string;
    clearReadyAt?: number;    // internal: when field first became empty
}

spawnReady(pending, now, alive): boolean
advanceSpawnQueue(pending, now, alive): { fired; remaining }
```

Trigger semantics:

- **`time`** fires once at `levelStartElapsedMs >= trigger.delayMs`.
- **`clear`** fires when no monster matching `trigger.waveId` (or any monster, if omitted) is alive, **plus** `trigger.delayMs` from the moment the condition first became true. If the field refills during the wait, the timer resets.

Triggers fire **once** per spawn — fired entries are removed from the queue.

### Pathfinding (`src/game/monsters/logic.ts`)

`PathfindingService` builds a grid from the level's `airWalls` and provides:

| Method                                      | Purpose                                           |
| ------------------------------------------- | ------------------------------------------------- |
| `worldToGrid(x, y)` / `gridToWorld(gx, gy)` | coord conversion                                  |
| `hasLineOfSight(start, end, bodyRadius?)`   | straight-line check, used as A* shortcut          |
| `findPath(start, target)`                   | A* over the wall grid; returns smoothed waypoints |

Pure AI helpers (no Phaser): `distBetween`, `dirTo`, `decideAIState`, `chaseVelocity`, `pickClosestMonster`, `calcSeparationForce`, `getSurroundOffset`, `getPathLookAheadPoint`. These compose inside the controller's per-frame loop.

### `path-debug-overlay.ts`

When the editor's "Air walls" tab toggles path debug on (`EventBus.emit('path-debug-visible', true)`), `MonsterController` forwards every live monster's current A* path + chase target to `PathDebugOverlay`, which renders green rectangles + lines. The overlay hides the moment the toggle goes off.

## Events emitted

| Event                                       | When                                                |
| ------------------------------------------- | --------------------------------------------------- |
| `sfx:monster-aggro`                         | monster acquired target, first aggro frame          |
| `sfx:monster-hit`                           | monster took damage (throttled by `sfx.throttleMs`) |
| `sfx:<weapon>.shoot` or `sfx:monster-shoot` | ranged fire (uses weapon's `sfx.shoot` or fallback) |
| `sfx:monster-death`                         | death animation start                               |
| `sfx:player-hit`                            | monster melee or projectile lands on player         |

## Events subscribed

None — monsters are pure emitters. Damage application flows through the controller's `cb.onPlayerHit(...)` callback instead.

## Adding a new monster

1. Generate the sprite sheet (4×4 grid, magenta chroma key) via `scripts/generate-image.ts <id>` + `scripts/split-sheet.ts`.
2. Write `public/data/monsters/<id>.yaml` matching the schema above. Pick `weaponId` from `public/data/weapons/`.
3. Append `<id>` to `public/data/monsters/index.yaml`.
4. Reference it from a level: add `- type: <id>` under `monsters:` in `public/data/levels/<level>.yaml`. Add `waveId` + `trigger` for wave-gated spawns (see [`SCENES.md`](./SCENES.md#spawn-triggers)).
5. No TS code changes.

## Conventions

- **Monster sprites are 4×4 = 16 cells** (rows: idle / move / hit / death; 15 frames + 1 empty cell). The split-sheet script handles chroma-key + downsampling.
- **Per-monster `weaponId`** is required; monsters can't fight bare-handed.
- **`statusHud` is per-monster**, not shared. The HP bar follows the monster body and tween-fades on death.
- **`weaponVisual` is per-monster**, mirroring the player's `WeaponController` so monsters visually hold the same weapon.
- **Drop roll happens on death**, before the dying animation. Drops inherit the monster's position; physics simulation takes over.
- **Drops are static objects once spawned** — `DropController.spawn(spec, x, y)`.
- **Body defaults to 14×14** when the YAML omits the `body` block; explicit `halfW`/`halfH` is preferred for non-trivial monsters.