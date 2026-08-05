# WEAPONS

Player-held weapons and monster weapons. One yaml per weapon id; the controller owns the runtime.

## File layout

```
src/lib/weapons/
├── schema.ts      # Zod schema (source of truth) — WeaponSpecSchema, superRefine kind check
├── types.ts       # WeaponSpec, WeaponIndex (z.infer)
├── parser.ts      # parseWeaponYaml(text, id) → WeaponSpec
├── loader.ts      # async fetchWeapon(id) using handle-fetch
├── prefetch.ts    # collectWeaponIds(level, monsterSpecMap)
└── index.ts       # public barrel

src/game/weapons/
├── logic.ts       # WeaponController + isPlayerBullet / isWall helpers
├── visual.ts      # WeaponVisualController (orbit / recoil / swing)
└── weapon.ts      # spawnProjectile / spawnMeleeHitbox / BulletRecord / trail

public/data/weapons/
├── index.yaml
└── <id>.yaml      # one per weapon (player + monster melee/ranged)
```

The shipped set includes the player's six weapons plus the level-1
(`drone-claws`, `gunner-blast`) and level-2 Rusted Hollow Citadel
monster weapons (`thorn-scythe-claws`, `moss-bark-rifle`, `vine-lash`,
`rune-shield`, `branch-sweep`, `bramble-knuckles`, `thorn-bolt`,
`vine-tip`, `rune-shard`, `sap-drop`, `thorn-orb`). `gunner-blast` is
kept as a legacy entry that the controller currently never references.

## YAML schema — `public/data/weapons/<id>.yaml`

Ranged vs melee is decided by whether `projectile` is set. Exactly one of them is required (`superRefine` enforces). `clipSize` / `reloadTimeMs` / `bulletsPerShot` are player-only; monster weapons omit them (cooldown alone gates monster fire).

```yaml
id: assault-rifle # optional; loader overwrites with filename
name: Assault Rifle
damage: 2
cooldownMs: 100 # ms between shots
range: 550 # max travel distance for projectiles / hitbox radius for melee

visual: # floating sprite that orbits the holder
    texture: assets/image/weapons/assault-rifle.png # optional; debug rect if absent
    scale: 0.16 # default 0.16
    orbitRadius: 18 # default 16
    anchor: [0.45, 0.5] # default [0.2, 0.5] — grip point relative to texture
    muzzleOffset: 400 # default 400 — bullet spawn point in weapon-local space
    recoilDistance: 6 # default 6
    recoilDuration: 80 # default 80 (ms)
    swingAngle: 200 # default 120 (melee only)
    rotationOffset: 0 # default 0 (degrees)

bullet: # sprite / beam / melee-hitbox — one per fire (repeats per bulletsPerShot)
    texture: assets/image/weapons/assault-bullet.png
    type: projectile # 'projectile' | 'beam' | 'melee'
    speed: 700 # optional for melee (defaults to projectile.speed)
    scale: 0.08 # default 1
    color: 0xE0C071 # fallback tint when no texture (string per schema)
    beamWidth: 8 # beam only
    beamDuration: 300 # beam only (ms)
    anchor: [0.5, 0.5] # optional
    rotationOffset: 0 # optional
    spawnOffset: [10, -10] # extra offset from muzzle

projectile: # REQUIRED for ranged (defines speed + collision shape)
    speed: 24
    visual: # legacy shape; newer code uses `bullet.texture`
        radius: 4
        width: 2
        height: 2
        color: 0x23C9D0

# ─── Player-only (omit on monster weapons) ─────────────────────
clipSize: 30
reloadTimeMs: 1500
bulletsPerShot: 1

# ─── Melee-only (omit on ranged weapons) ──────────────────────
hitWidth: 120 # sensor width
hitHeight: 120 # sensor height

sfx: # all optional — controller falls back to global ids
    shoot: assault-rifle-shoot # falls back to 'player-shoot' (player) or 'monster-shoot' (monster)
    dryFire: dry-fire
    bulletWall: bullet-wall
    reloadStart: reload-start
    reloadFinish: reload-finish
    throttleMs: 80 # min gap between bulletWall plays for this weapon id
```

## Public API (`src/lib/weapons/index.ts`)

```ts
import {
    parseWeaponIndex,
    parseWeaponYaml,
    fetchWeapon,
    fetchWeaponIndex,
    type WeaponSpec,
    type WeaponIndex,
} from '@/lib/weapons';
```

## Logic

### `WeaponController` (in `src/game/weapons/logic.ts`)

```ts
new WeaponController(scene, matter, body, weapons: WeaponSpec[])
```

Per-frame state, hotbar, magazine, reload, melee swing. Holds an array of `SlotState` (one per weapon id).

Key methods:

| Method                                                                                                 | Purpose                                                      |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| `update(time, tx, ty, fire, halfH)`                                                                    | per-frame: aim, recoil decay, fire-on-cooldown, reload timer |
| `switchTo(index)`                                                                                      | swap active weapon (visual tween + sfx)                      |
| `manualReload()`                                                                                       | start reload if magazine not full                            |
| `refillActiveAmmo(fraction)`                                                                           | pickup ammo — used by drops                                  |
| `swapToWeapon(weaponId)`                                                                               | pickup new weapon — returns false if id not in hotbar        |
| `getActive()` / `getSlot(i)` / `getAmmo()` / `getMaxAmmo()` / `isReloading()` / `getReloadProgress(t)` | HUD bindings                                                 |
| `destroy()`                                                                                            | teardown sprite + tweens                                     |

### `WeaponVisualController` (in `src/game/weapons/visual.ts`)

```ts
new WeaponVisualController(scene);
visual.setWeapon(spec); // null if no visual.texture; controller stays callable
visual.update(handX, handY, footY, aimAngle); // every frame
visual.triggerRecoil(); // tween backward+return
visual.triggerSwing(); // rotate arc + fade
visual.setVisible(false); // hide during death
visual.getMuzzlePosition(bodyX, bodyY); // spawn point for bullets
visual.destroy();
```

Mirrors how the player holds the weapon. `Monster` and `Character` both own one so monsters visually carry their weapon the same way the player does (see [`MONSTERS.md`](./MONSTERS.md) — `Monster.weaponVisual`).

### Bullet / melee spawn helpers (in `src/game/weapons/weapon.ts`)

```ts
spawnProjectile(scene, matter, origin, direction, opts): BulletRecord
spawnMeleeHitbox(scene, matter, opts): BulletRecord
createBulletTrail(scene)   // shared Graphics for trail rendering
pushBulletTrail(bullet, trail)   // record current body pos
renderBulletTrails(graphics, bullets)   // redraw + clear (call once per frame)
destroyBulletVisual(scene, bullet)
```

`spawnMeleeHitbox` accepts `category`, `mask`, `label` overrides so monsters can route hits through `monster-melee` label → player damage callback. Defaults preserve player-side behaviour.

## Events emitted

| Event                                    | When                                                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `sfx:weapon-switch`                      | hotbar swap                                                                                       |
| `sfx:reload-start` / `sfx:reload-finish` | manual reload lifecycle (falls back to global `reload-start`/`reload-finish` if spec omits sfx)   |
| `sfx:dry-fire`                           | trigger with empty magazine                                                                       |
| `sfx:bullet-wall`                        | bullet hit tall wall (throttled per weapon by `sfx.throttleMs`)                                   |
| `sfx:<weapon>.shoot` or `sfx:player-shoot` / `sfx:monster-shoot` | ranged fire (uses `weapon.sfx?.shoot` or falls back by holder) |

## Events subscribed

None — weapons are pure emitters.

## Conventions

- **One yaml per weapon id.** No sub-types in shared yaml files.
- **No `id` field** in yaml; the loader overwrites `spec.id` with the filename basename.
- **`bullet.texture` wins over `projectile.visual`** for rendered bullets. The legacy `projectile` block is kept for collision-shape data; new weapons should fill `bullet.texture` for visible projectiles.
- **Player ammo** lives in `WeaponController` (per-slot). Monster ammo is infinite — `cooldownMs` is the only gate.
- **Aim assist** is in `WeaponController.update` (constants in `src/lib/constants.ts → AIM_ASSIST`). It pulls the cursor toward monsters inside `INITIAL_SNAP_RADIUS`, then sticks to one within `STICKY_TETHER_RADIUS`.
- **Hit detection** — projectiles use Matter sensor bodies (`isSensor: true`) for collision events; melee uses the sensor + `body.collisionFilter` to limit what it overlaps.
- **SFX throttling** — every SFX field can carry an optional `throttleMs` to stop overlapping instances during sustained fire. Keyed per-weapon so different weapons fire independently.

## Adding a new weapon

1. Generate the sprite sheet + idle animation via `scripts/split-sheet.ts` + `scripts/generate-image.ts` (see [`SCENES.md`](./SCENES.md) for the pattern; weapons use the same prompt-based flow).
2. Write `public/data/weapons/<id>.yaml` matching the schema above.
3. Append `<id>` to `public/data/weapons/index.yaml`.
4. (If it's a player weapon) The character's `hotbar: []` is empty by default — players pick weapons up in the tavern via `weapon-drop` (see [`DROPS.md`](./DROPS.md)). Adding to `hotbar` makes it a starting weapon.
5. No TS code changes — `WeaponController` picks it up.

## Adding a new weapon trigger (rare)

Modify `WeaponController.update` + add a yaml field to `WeaponSpecSchema`. Mirror the per-sound pattern in [`AUDIOS.md`](./AUDIOS.md) where the schema field triggers a behaviour switch.