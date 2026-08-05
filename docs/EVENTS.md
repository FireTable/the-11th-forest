# EVENTS

The pub/sub bus every module uses to talk to each other without direct imports. Tiny module — one file, one singleton.

## File layout

```
src/lib/events/
├── bus.ts        # EventBus singleton + Listener<T> type
└── schema.ts     # EventNameSchema (documentation-only enum) + EventPayloadSchema
```

No `src/game/events/`. No yaml.

## Public API (`src/lib/events/bus.ts`)

```ts
import { EventBus } from '@/lib/events';

EventBus.emit('sfx:pickup-hp'); // no payload
EventBus.emit('level-loaded', { id, level }); // with payload

const off = EventBus.on('sfx:pickup-hp', () => {
    // subscribe
    // ...
});
off(); // unsubscribe
```

```ts
type Listener<T = unknown> = (payload: T) => void;
```

The bus is generic — payload types are inferred at the call site via `Listener<MyPayload>` (no runtime check). For type safety, wrap with a typed emitter helper at the module boundary:

```ts
import { SFX_EVENT } from '@/lib/constants';
EventBus.emit(SFX_EVENT('pickup-hp'));
```

## Event naming convention

All event names are stable contracts — renaming a published event is a breaking change to every consumer.

### Audio sink (`AudioController` listens)

| Event              | Producer                                                            | When                                                          |
| ------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------- |
| `sfx:<id>`         | gameplay (weapons / monsters / characters / drops)                   | play that sfx (e.g. `sfx:pickup-hp`)                          |
| `music:<id>`       | scene                                                               | cross-fade into that music track (singleton-aware — see AUDIOS.md) |
| `music:stop`       | scene (silent level)                                                | stop the singleton BGM                                        |
| `music:pause`      | `SettingsOverlay` (settings open)                                   | pause the singleton BGM                                       |
| `music:resume`     | `SettingsOverlay` (settings close)                                 | resume the singleton BGM                                      |

### Scene lifecycle (everyone listens)

| Event                  | Producer      | Consumer / Payload                                                |
| ---------------------- | ------------- | ----------------------------------------------------------------- |
| `level-loaded`         | scene         | `{ id, level }` — debug panel + canvas-fit                       |
| `current-scene-ready`  | scene         | `this` (the scene) — `PhaserGame.tsx` resolves the scene ref      |
| `player-died`          | character     | scene (pause) + `DeathOverlay`                                    |
| `character-position`   | scene         | tavern weapon-replace hub (per-frame, only listened while open)   |

### Tavern selection

| Event           | Producer               | Consumer / Payload                                                |
| --------------- | ---------------------- | ----------------------------------------------------------------- |
| `tavern-focus`  | `TavernController`     | `TavernFocusPayload \| null` — see CHARACTERS.md; React `TavernHud` listens |

### Editor (in-browser, dev-only)

| Event                         | Producer                  | Consumer                                            |
| ----------------------------- | ------------------------- | --------------------------------------------------- |
| `editor-open`                 | editor panel              | scene + `MaterialManager` + canvas-fit (toggle)     |
| `editor-material-tab-active`  | editor panel              | `MaterialManager` (drag enable)                     |
| `path-debug-visible`          | editor air-walls tab      | `MonsterController` → `PathDebugOverlay`            |
| `material-add`                | editor materials section  | `MaterialManager`                                   |
| `material-update-props`       | editor materials section  | `MaterialManager`                                   |
| `material-delete`             | editor materials section  | `MaterialManager`                                   |
| `material-select-id`          | editor materials section  | `MaterialManager`                                   |
| `material-selected`           | `MaterialManager`         | editor materials section                            |
| `material-updated`            | `MaterialManager`         | editor materials section                            |
| `teleporter-updated`          | scene / `TeleporterController` | editor teleporters section                       |
| `teleporter-changed`          | editor teleporters section    | `TeleporterController`                            |

### Dev cheats

| Event                       | Producer       | Consumer                                    |
| --------------------------- | -------------- | ------------------------------------------- |
| `dev:cheat:<key>`           | cheat panel    | the system the cheat targets (e.g. `dev:cheat:muted` → `AudioController`, `dev:cheat:infiniteHp` → `CharacterController`) |

### Mobile / touch (React HUD → Phaser)

| Event                   | Producer             | Consumer                                  |
| ----------------------- | -------------------- | ----------------------------------------- |
| `mobile:move`           | `TouchControls`      | `CharacterController` (unit vector)       |
| `mobile:firing`         | `TouchControls`      | `WeaponController` (boolean state)        |
| `mobile:dodge`          | `TouchControls`      | `CharacterController` (boolean state)     |
| `mobile:weapon:switch`  | `WeaponHUDOverlay`   | `CharacterController` (`{ index }`)       |

### Aim / crosshair

| Event                    | Producer                  | Consumer                                  |
| ------------------------ | ------------------------- | ----------------------------------------- |
| `aim-crosshair-update`   | `CharacterController` / `TavernController` | `PixelCrosshair` HUD (per-frame) |

## Conventions

- **Emit via `EventBus.emit`, never via direct method calls across modules.** Two modules that need to talk go through the bus, even if it feels heavier.
- **One source of truth for event-name construction.** Use the `*_EVENT` helpers in `src/lib/constants.ts` (`SFX_EVENT`, `MUSIC_EVENT`, etc.) instead of building strings inline.
- **Listeners are cheap to add but must be removable.** Any `on()` call in module init should have a matching `off()` on module teardown — typically in `destroy()` of the controller that registered it. When the cleanup hangs off a Phaser scene, register it on **both** `shutdown` and `destroy`: stopping a scene emits `shutdown`, but tearing the whole game down (HMR, React unmount) emits only `destroy`. Miss the second and a stale listener survives holding dead game objects.
- **No payload schema enforcement at runtime.** The `EventNameSchema` in `schema.ts` is documentation-only (it lists a known-safe subset: `editor-open`, `level-loaded`, `current-scene-ready`, `path-debug-visible`). Validate payload shape at the consumer if it matters.
- **Async work in listeners is fine but unbounded.** The bus is sync — if a listener does expensive work it blocks every other listener.

## Adding a new event

1. Pick a clear `prefix:detail` name. Avoid verbs in the past tense — `weapon-switch`, not `weapon-switched`.
2. Document it in the table above (this file).
3. Add a typed helper in `src/lib/constants.ts` if it's a category you'll emit repeatedly (e.g. `SFX_EVENT`).
4. Emit from the producer module, listen in the consumer module. No new abstraction needed — the bus is already there.
5. Update the documentation table above when adding.

## Why a single bus (not direct imports)

- **Decouples lifecycle.** The character controller doesn't need to know whether an audio controller exists or not — it just emits. A future mod that listens to `sfx:dodge` doesn't require touching `CharacterController`.
- **Crosses the Phaser ↔ React boundary cleanly.** Phaser scenes emit events; the React HUD layer (in `src/components/hud/`) subscribes via `useGameStore` instead of touching the bus directly. Same event model, different bridge.
- **Trivial to mock in tests.** Replace `EventBus.emit` with a spy; assert what was emitted. No Phaser Scene instance required.