# DROPS

Pickup items — hp shards, ammo caches, weapons, etc. Two kinds: `static` (level-placed) and `monster` (rolled on death, see [`MONSTERS.md`](./MONSTERS.md)).

## File layout

```
src/lib/drops/
├── schema.ts      # DropSpecSchema, discriminated DropEffectSchema
├── types.ts       # z.infer'd types
├── parser.ts      # parseDropYaml(text, id)
├── loader.ts      # fetchDrop(id)
├── prefetch.ts    # collect drop ids referenced by a level
└── index.ts       # public barrel

src/game/drops/
├── drop.ts        # DropInstance + DropController
└── logic.ts       # planDropEffect (pure applier)

public/data/drops/
├── index.yaml
├── hp-shard.yaml
├── sp-fragment.yaml
├── ammo-cache.yaml
└── overcharge-core.yaml
```

## YAML schema — `public/data/drops/<id>.yaml`

```yaml
id: hp-shard # optional; loader overwrites with filename
name: HP Shard
kind:
    static # 'static' | 'monster'
    # static: placed in level; monster: rolled on death

effect: # exactly one of the three discriminated variants
    type: instant # 'instant' | 'refill-ammo' | 'weapon'
    hp: 10 # instant: amount to add (0 if absent)
    sp: 0 # instant: amount to add (0 if absent)
    # OR:
    # type: refill-ammo
    # ammoFraction: 0.5   # 0..1 of active weapon's clip
    # OR:
    # type: weapon
    # weaponId: plasma-sword

sfx: pickup-hp # override default 'pickup-generic' sfx

sprite: # optional; fallback rectangle if absent
    texture: assets/image/drops/hp-shard.png
    grid: { rows: 1, cols: 1 }
    scale: 0.4

anims:
    idle: { frames: [0, 0], frameRate: 1, repeat: -1 } # static bob

prompt: | # AI sprite template (rarely needed; most drops reuse textures)
    …
```

## Public API (`src/lib/drops/index.ts`)

```ts
import {
    parseDropIndex,
    parseDropYaml,
    fetchDrop,
    fetchDropIndex,
    type DropSpec,
    type DropIndex,
    type DropEffect,
    type DropType,
} from '@/lib/drops';
```

## Logic

### `planDropEffect` (in `src/game/drops/logic.ts`)

Pure applier. Returns a `DropEffectResult` describing what to apply — the controller does the actual side-effects via callbacks.

```ts
planDropEffect(spec, ctx): {
    hp?: number;
    sp?: number;
    refillAmmoFraction?: number;
    grantWeaponId?: string;
}
```

- `instant` → `{ hp, sp }`
- `refill-ammo` → `{ refillAmmoFraction }`
- `weapon` → `{ grantWeaponId }`

The controller then calls `cb.onHeal`, `cb.onRefillAmmo`, `cb.onGrantWeapon` depending on the result. Keeps `logic.ts` Phaser-free for testing.

### `DropInstance` (in `src/game/drops/drop.ts`)

Single pickup object. Owns: Matter body (sensor), sprite, animation state. Constructed by `DropController.spawn`.

### `DropController` (in `src/game/drops/drop.ts`)

Owns the array of active drops + collision wiring. Per-frame `update()` animates them.

```ts
new DropController(scene, matter, characterBody, specMap, cb);
```

| Method              | Purpose                                     |
| ------------------- | ------------------------------------------- |
| `spawn(spec, x, y)` | create new DropInstance, add to active list |
| `update()`          | per-frame animation tick                    |
| `destroy()`         | teardown all drops                          |

Collision handler listens for `collisionstart` between a drop sensor and the character body. On overlap:

1. Compute effect via `planDropEffect`
2. Fire callbacks (`cb.onHeal`, `cb.onRefillAmmo`, `cb.onGrantWeapon`)
3. Emit `sfx:<spec.sfx>` (or `sfx:pickup-generic` fallback)
4. Destroy the drop

## Events emitted

| Event                                     | When           |
| ----------------------------------------- | -------------- |
| `sfx:pickup-<id>` or `sfx:pickup-generic` | drop collected |

## Events subscribed

None — drops are passive until collision fires.

## Adding a new drop

1. Generate / source the sprite (1×1 frame is enough for most drops).
2. Write `public/data/drops/<id>.yaml` matching the schema.
3. Append `<id>` to `public/data/drops/index.yaml`.
4. Reference from a level (static): `public/data/levels/<level>.yaml → dropSpawns:`.
5. **Or** add to a monster's drop table: `public/data/monsters/<id>.yaml → drops:`.
6. No TS code changes.

## Conventions

- **Two kinds, one schema** — `kind: 'static' | 'monster'`. Same yaml can serve both, but `kind: 'monster'` drops without a level entry simply won't spawn at level start.
- **Effect is a discriminated union** — `type` is the discriminator, exactly one variant. Schema enforces this; adding a new effect kind = add a new schema variant + extend `planDropEffect`.
- **Drop position inherits from caller** — static: from `level.dropSpawns[i].x/y`. Monster: from monster's body position at death.
- **No pickup-on-overlap-by-name** — collision uses Matter sensor bodies + `collisionstart` events, not raycasts.
- **Drops don't despawn over time** — they live until picked up. Add a despawn timer only if level design demands it (not currently the case).
