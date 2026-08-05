# Persistence · Save & Restore

How a run survives a page refresh. One store, one localStorage key, one write per second.

Source: [`src/store/game-store.ts`](../src/store/game-store.ts).

## Why the UI store is also the save file

`useGameStore` started as a HUD mirror — Phaser pushes numbers in, React components read them out. Everything a save file needs (HP, ammo, level id, clock, tavern state) was already flowing through it, so persistence is a `persist` middleware wrapper rather than a second system. There is no separate save module, and no save/load UI: the game autosaves and auto-resumes.

```
Phaser systems ──(setters)──▶ useGameStore ──(persist)──▶ localStorage
                                   │
                                   └──(selectors)──▶ React HUD
```

## Storage

|         |                                            |
| ------- | ------------------------------------------ |
| Key     | `11th_forest_save_v1`                      |
| Backend | `localStorage` (zustand `persist` default) |
| Format  | JSON, `{ state, version }`                 |

Bump the key suffix (`_v2`) when a shape change would make old saves restore wrong. There is no migration function — a new key simply means existing players start fresh, which is the cheap correct answer for a game with no cloud accounts.

## What is persisted

`partialize` is an allow-list — anything not named here lives only in memory:

| Field                                         | Restores                                         |
| --------------------------------------------- | ------------------------------------------------ |
| `currentLevelId`                              | which level to boot into                         |
| `levelProgressMap`                            | per-level `{ currentWaveIndex, clearedWaveIds }` |
| `characterName`, `hp`, `maxHp`, `sp`, `maxSp` | the player's bars                                |
| `slots`, `activeWeaponIndex`                  | per-weapon ammo + which weapon is drawn          |
| `levelElapsedMs`                              | the MM:SS level clock                            |
| `playerSnapshot`                              | `{ x, y }`                                       |
| `activeMonstersSnapshot`                      | `{ activeMonsters[], pendingSpawnIndices[] }`    |
| `groundDropsSnapshot`                         | uncollected drops still on the floor             |
| `selectedCharacterId`                         | tavern selection (id of the chosen character)    |
| `tavernCleared`                               | `true` once the player has left the tavern      |

Deliberately **not** persisted: `isDead`, `hubsVisible`, `levelTitle`, `isReloading`, `reloadProgress`, `activeAmmo` / `activeMaxAmmo` (derived from `slots`), and `tavernWeaponCount` (resets each tavern session — counted, not stored). Transient or recomputed on load — persisting them would only create ways to restore into an inconsistent state.

## Setters

The store exposes typed setters per HUD slice. The most important are:

| Setter                                                                                  | Purpose                                                                       |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `setLevelTitle(title)`                                                                  | HUD title                                                                     |
| `setCurrentLevelId(levelId)`                                                            | drives boot-time `resolveScene`                                               |
| `setWaveProgress(levelId, { currentWaveIndex, clearedWaveIds })`                        | wave-by-wave completion                                                       |
| `setLevelElapsedMs(ms)`                                                                 | clock — **prefer piggybacking via `setEntitySnapshots` instead**              |
| `setEntitySnapshots({ player?, monsters?, drops?, elapsedMs? })`                        | **the** 1Hz tick — folds clock + all three entity snapshots into one `set()`   |
| `setCharacterStats({ name?, hp, maxHp, sp, maxSp })`                                    | character bars                                                                |
| `setWeaponStats({ activeIndex, name, ammo, maxAmmo, isReloading, reloadProgress, slots })` | weapon HUD                                                                  |
| `setHubsVisible(visible)`                                                               | HUD visibility (death, settings)                                              |
| `setDead(dead)`                                                                         | death state                                                                   |
| `resetLevelProgress(levelId)`                                                           | wipe one level's wave progress, zero HP/SP, drop snapshots + clock             |
| `clearSceneSnapshots()`                                                                 | wipe only the three entity snapshots — preserves hotbar / HP / SP / character |
| `clearSaveData()`                                                                       | wipe everything and reset to `initialGameState`                              |
| `setSelectedCharacterId(id)`                                                            | tavern selection                                                              |
| `setTavernCleared(cleared)`                                                             | mark tavern complete                                                          |
| `setTavernWeaponCount(n)`                                                               | per-session weapon counter (not persisted)                                    |

## Write cadence — one store write per second

`LoadScene.tickSaveState()` ([`scene.ts`](../src/game/scenes/scene.ts)) is the only writer during play. It runs off the scene's `update` loop, throttled to 1Hz, and pushes the clock **and** all three entity snapshots in a single `setEntitySnapshots` call.

That single call is the design, not a detail. `persist` serialises the whole partialized state and writes localStorage **synchronously on every `set`** — so each extra store write during combat is a `JSON.stringify` of the live monster list on the main thread. The level clock used to push at 5Hz on its own; folding it into the snapshot tick (via the `elapsedMs` field) cut the write rate by 5×. 1Hz also matches the clock's MM:SS display resolution, so nothing visible was traded away.

**Rule for new persisted state: add it to the 1Hz tick, don't add another setter that fires per-frame.** Setters that fire on discrete events (level change, death, pickup) are fine — those are rare.

## Restore paths

Each system reads the store in its own constructor. Nothing is orchestrated centrally; a system that finds no snapshot falls back to its level-YAML behaviour.

| System          | File                      | Behaviour                                                                                                                 |
| --------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Boot            | `game/main.ts`            | `currentLevelId` set → resolve that level; resolve failure or empty → default id                                          |
| Player position | `characters/character.ts` | `playerSnapshot` → `level.characterSpawn` → image centre                                                                  |
| HP / SP         | `characters/logic.ts`     | saved value clamped to the spec maximum; `hp <= 0` counts as "no save"                                                    |
| Weapons         | `weapons/logic.ts`        | ammo matched by weapon id (falls back to slot index), clamped to `clipSize`; `activeWeaponIndex` restored if in range     |
| Monsters        | `monsters/monster.ts`     | rebuilds live monsters at their saved position + HP, and re-queues only the pending spawns named in `pendingSpawnIndices` |
| Drops           | `drops/drop.ts`           | snapshot present → restore those ground drops **instead of** the level's static `dropSpawns`                              |
| Level clock     | `scenes/scene.ts`         | `levelStartAt = now - savedElapsedMs`, so the timer continues rather than resetting                                       |
| Wave progress   | `monsters/monster.ts`     | `levelProgressMap[levelId].clearedWaveIds` records which waves are done                                                   |
| Tavern state    | `scenes/scene.ts` + tavern-controller | `selectedCharacterId` decides between tavern phase 1 (selection) and phase 2 (already chose)             |

## Reset paths

Three ways a save is discarded, each with a distinct purpose:

- **Death → Restart** — `DeathOverlay` calls `resetLevelProgress(levelId)`: drops that level's wave progress, zeroes HP/SP, clears all three snapshots and the clock. Dying must not resume you into the fight that killed you.
- **Teleport to another level** — `TeleporterController` sets the new `currentLevelId` and calls `clearSceneSnapshots()`, so the next level spawns from its own YAML instead of inheriting the previous level's monsters. HP / hotbar / character survive.
- **Full reset (settings → Restart from tavern)** — `restartAtTavern()` clears everything: `selectedCharacterId`, `tavernCleared`, slots, snapshots. Next launch lands in the tavern phase 1 again.

`clearSaveData()` wipes the key entirely and resets to `initialGameState`. Nothing in the UI calls it yet — it exists for a future "new game" button and for clearing a corrupt save from the console:

```js
useGameStore.getState().clearSaveData();
```

## Sharp edges

Known, currently accepted:

- **`?scene=<id>` is ignored once a save exists.** `main.ts` checks `currentLevelId` before it ever calls `resolveDefaultSceneId()`, and that is where the URL override lives. To force a level, clear the save first (`clearSaveData()`) or use the editor's jump-to-scene.
- **`hp: 0` doubles as "no save".** `resetLevelProgress` writes `hp: 0`, and the restore side treats `hp > 0` as "a save exists". The two meanings are conflated; `undefined` would say it plainly.
- **Monsters restore by `specId`, not by identity.** A restored monster is matched to the first level spawn sharing its spec id, so per-spawn fields other than position and HP (e.g. a bespoke weapon on one particular spawn) can be lost.
- **A save is only as fresh as the last tick.** Up to one second of play is lost on a hard crash. That is the price of the 1Hz write and is not worth trading back.
- **`tavernWeaponCount` is not persisted** by design — it's a per-session counter, and the tavern scene always opens with a fresh zero.