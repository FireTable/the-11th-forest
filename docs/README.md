# Docs · Index

This directory holds long-form docs for The 11th Forest. One topic per file, named in `UPPERCASE-ENGLISH.md` (e.g. `DESIGN.md`, `MECHANICS.md`).

## Index

| Doc                                  | Topic                                                                             |
| ------------------------------------ | --------------------------------------------------------------------------------- |
| [`CONVENTIONS.md`](./CONVENTIONS.md) | Coding rules — TDD, file size, layout, import alias.                              |
| [`MODULES.md`](./MODULES.md)         | The yaml → schema → parser → loader → logic pattern shared by every module.       |
| [`SCENES.md`](./SCENES.md)           | Scene file layout, loading flow, `handle-fetch`, how to add a new scene.          |
| [`WEAPONS.md`](./WEAPONS.md)         | Weapon yaml schema + `WeaponController` + `WeaponVisualController`.               |
| [`MONSTERS.md`](./MONSTERS.md)       | Monster yaml schema + `Monster` / `MonsterController` + AI helpers + spawn queue. |
| [`CHARACTERS.md`](./CHARACTERS.md)   | Character yaml schema + `CharacterController` + per-gender hurt routing + tavern selection. |
| [`DROPS.md`](./DROPS.md)             | Drop yaml schema + `DropController` + pickup flow.                                |
| [`AUDIOS.md`](./AUDIOS.md)           | Audio yaml schema + `AudioController` + BGM singleton + ElevenLabs regen pipeline. |
| [`EVENTS.md`](./EVENTS.md)           | `EventBus` pub/sub bus, naming conventions, lifecycle rules.                      |
| [`PERSIST.md`](./PERSIST.md)         | Save & restore — what the store persists, write cadence, reset paths.             |
| [`EDITOR.md`](./EDITOR.md)           | In-browser level editor — panel layout, Konva overlay, save endpoint.             |
| [`SKILL.md`](./SKILL.md)             | How to maintain `public/data/` — schema discipline, balance calculations, AI-asset regeneration. |

## Convention

- File names: `UPPERCASE-ENGLISH.md` (kebab-case is fine for long names: `COMBAT-MECHANICS.md`).
- One topic per file. If a doc grows past ~500 lines, split it.
- Add a row to the table above when you create a new doc.
- Link from `../README.md` and `../README-CN.md` only if the doc belongs in the main intro; otherwise just keep it in this index.
