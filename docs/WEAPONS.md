# WEAPONS

Player-held weapons and monster weapons. One yaml per weapon id; the controller owns the runtime.

## File layout

```
src/lib/weapons/
├── schema.ts      # Zod schema (source of truth)
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
├── assault-rifle.yaml
├── shotgun.yaml
├── laser-cannon.yaml
├── rocket-launcher.yaml
├── arcana-staff.yaml
├── plasma-sword.yaml
├── drone-claws.yaml          # monster melee
└── gunner-blast.yaml         # legacy (no longer used post-swap)
```

## YAML schema — `public/data/weapons/<id>.yaml`

Ranged vs melee is decided by whether `projectile` is set. Exactly one of them is required (`superRefine` enforces).

```yaml
id: assault-rifle                 # optional; loader overwrites with filename
name: Assault Rifle
damage: 8
cooldownMs: 250
range: 600

visual:                           # floating sprite that orbits the holder
    texture: assets/image/weapons/assault-rifle.png
    scale: 0.4
    orbitRadius: 16
    anchor: [0.45, 0.5]          # grip point relative to texture
    muzzleOffset: [22, 0]         # bullet spawn point in weapon-local space
    recoilDistance: 6
    recoilDuration: 80
    swingAngle: 90                # for melee only
    rotationOffset: 0             # degrees

bullet:                           # one per fire; can repeat via bulletsPerShot
    texture: assets/image/weapons/assault-bullet.png
    type: projectile              # 'projectile' | 'beam' | 'melee'
    speed: 14
    scale: 0.3
    color: 0xE0C071               # fallback color if no texture
    beamWidth: 8                  # beam only
    beamDuration: 300             # beam only
    anchor: [0.5, 0.5]
    rotationOffset: 0
    spawnOffset: [0, 0]           # extra offset from muzzle

projectile:                       # REQUIRED for ranged (no `bullet` then ranged via projectile)
    speed: 14
    visual:                       # legacy shape; newer code uses `bullet` + `spawnOffset`
        radius: 4
        width: 8
        height: 8
        color: 0xE0C071

clipSize: 30                      # player-only magazine (optional)
reloadTimeMs: 1500
bulletsPerShot: 1
hitWidth: 80                     # melee only — sensor width
hitHeight: 80                    # melee only — sensor height

sfx:
    shoot: assault-rifle-shoot    # optional override; default falls back
    dryFire: dry-fire             # to bullet-wall, weapon-switch, etc.
    bulletWall: bullet-wall
    reloadStart: reload-start
    reloadFinish: reload-finish

prompt: Heavy anime assault rifle shot, low punchy burst  # AI regen prompt (used by scripts/elevenlabs-sfx.ts if ElevenLabs provider)
```

## Public API (`src/lib/weapons/index.ts`)

```ts
import {
    parseWeaponIndex, parseWeaponYaml,
    fetchWeapon, fetchWeaponIndex,
    type WeaponSpec, type WeaponIndex,
} from '@/lib/weapons';
```

## Logic

### `WeaponController` (in `src/game/weapons/logic.ts`)

```ts
new WeaponController(scene, matter, body, weapons: WeaponSpec[])
```

Per-frame state, hotbar, magazine, reload, melee swing. Holds an array of `SlotState` (one per weapon id).

Key methods:

| Method | Purpose |
|---|---|
| `update(time, tx, ty, fire, halfH)` | per-frame: aim, recoil decay, fire-on-cooldown, reload timer |
| `switchTo(index)` | swap active weapon (visual tween + sfx) |
| `manualReload()` | start reload if magazine not full |
| `refillActiveAmmo(fraction)` | pickup ammo — used by drops |
| `swapToWeapon(weaponId)` | pickup new weapon — returns false if id not in hotbar |
| `getActive()` / `getSlot(i)` / `getAmmo()` / `getMaxAmmo()` / `isReloading()` / `getReloadProgress(t)` | HUD bindings |
| `destroy()` | teardown sprite + tweens |

### `WeaponVisualController` (in `src/game/weapons/visual.ts`)

```ts
new WeaponVisualController(scene)
visual.setWeapon(spec)   // null if no visual.texture; controller stays callable
visual.update(handX, handY, footY, aimAngle)   // every frame
visual.triggerRecoil()   // tween backward+return
visual.triggerSwing()    // rotate arc + fade
visual.setVisible(false) // hide during death
visual.getMuzzlePosition(bodyX, bodyY)         // spawn point for bullets
visual.destroy()
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

| Event | When |
|---|---|
| `sfx:weapon-switch` | hotbar swap |
| `sfx:reload-start` / `sfx:reload-finish` | manual reload lifecycle |
| `sfx:dry-fire` | trigger with empty magazine |
| `sfx:bullet-wall` | bullet hit tall wall |
| `sfx:<weapon>.shoot` | ranged fire (uses `weapon.sfx?.shoot` or falls back to `weapon-switch` path for melee) |

## Events subscribed

None — weapons are pure emitters.

## Conventions

- **One yaml per weapon id.** No sub-types in shared yaml files.
- **No `id` field** in yaml; the loader overwrites `spec.id` with the filename basename.
- **`bullet.texture` wins over `projectile.visual`** for rendered bullets. The legacy `projectile` block is kept for older weapons without a sprite; new weapons should fill `bullet.texture`.
- **Player ammo** lives in `WeaponController` (per-slot). Monster ammo is infinite — `cooldownMs` is the only gate.
- **Aim assist** is in `WeaponController.update` (constants in `src/lib/constants.ts → AIM_ASSIST`). It pulls the cursor toward monsters inside `INITIAL_SNAP_RADIUS`, then sticks to one within `STICKY_TETHER_RADIUS`.
- **Hit detection** — projectiles use Matter sensor bodies (`isSensor: true`) for collision events; melee uses the sensor + `body.collisionFilter` to limit what it overlaps.

## Adding a new weapon

1. Generate the sprite sheet + idle animation via `scripts/split-sheet.ts` + `scripts/generate-image.ts` (see [`SCENES.md`](./SCENES.md) for the pattern; weapons use the same prompt-based flow).
2. Write `public/data/weapons/<id>.yaml` matching the schema above.
3. Append `<id>` to `public/data/weapons/index.yaml`.
4. (If it's a player weapon) Append `<id>` to `public/data/characters/wanderer.yaml → hotbar`.
5. No TS code changes — `WeaponController` picks it up.

## Adding a new weapon trigger (rare)

Modify `WeaponController.update` + add a yaml field to `WeaponSpecSchema`. Mirror the per-sound pattern in [`AUDIOS.md`](./AUDIOS.md) where the schema field triggers a behaviour switch.