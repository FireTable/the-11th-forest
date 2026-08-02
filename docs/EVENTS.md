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
const SFX_EVENT = (id: string): string => `sfx:${id}`; // src/lib/constants.ts
EventBus.emit(SFX_EVENT('pickup-hp'));
```

## Event naming convention

| Prefix                                        | Producer                                           | Consumer                                 |
| --------------------------------------------- | -------------------------------------------------- | ---------------------------------------- |
| `sfx:<id>`                                    | gameplay (weapons / monsters / characters / drops) | `AudioController`                        |
| `music:<id>`                                  | scenes                                             | `AudioController`                        |
| `music-stop` / `music-pause` / `music-resume` | scenes (scene lifecycle)                           | `AudioController`                        |
| `level-loaded`                                | scene                                              | debug panel + others                     |
| `current-scene-ready`                         | scene                                              | scene consumers (awaiting the scene ref) |
| `editor-open`                                 | debug panel                                        | scene                                    |
| `aim-crosshair-update`                        | `CharacterController`                              | React crosshair component                |

All event names are stable contracts — renaming a published event is a breaking change to every consumer.

## Conventions

- **Emit via `EventBus.emit`, never via direct method calls across modules.** Two modules that need to talk go through the bus, even if it feels heavier.
- **One source of truth for event-name construction.** Use the `*_EVENT` helpers in `src/lib/constants.ts` (`SFX_EVENT`, `MUSIC_EVENT`, etc.) instead of building strings inline.
- **Listeners are cheap to add but must be removable.** Any `on()` call in module init should have a matching `off()` on module teardown — typically in `destroy()` of the controller that registered it.
- **No payload schema enforcement at runtime.** The `EventNameSchema` in `schema.ts` is documentation-only. Validate payload shape at the consumer if it matters.
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
