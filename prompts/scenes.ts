/**
 * prompts/scenes.ts
 * --------------------------------------------------------------------------
 * Scene templates for "The 11th Forest", in render order.
 * Append new scenes at the end of the array — never reorder, since
 * `number` is referenced by level data and save files.
 *
 * Each scene is a separate entry; if a scene grows large (>~80 lines),
 * split into its own file (e.g. `scenes/outer-forest.ts`) and re-import.
 *
 * Pair with:
 *   node -e 'console.log(require("./prompts/scenes").scenes[0].body)'
 *   node -e 'console.log(require("./prompts/scenes").scenes[0].size)'
 */

export const scenes = [
    {
        number: 1,
        id: 'outer-forest-scene',
        kind: 'image',
        // Output resolution; consumed by scripts via `scenes[i].size`.
        // Image prompts only — music/copy prompts omit this field.
        size: '2752x1536',
        title: 'The 11th Forest — Outer Forest Clearing',
        prompt: `The 11th Forest — Sacred Forest Sanctuary

Create a premium handcrafted pixel-art environment for a top-down RPG game.

This is a seamless game level background, not an illustration, not concept art, and not a tile sheet.

Image size 2752×1536 (16:9).

Camera is perfectly top-down (90° orthographic). Absolutely no perspective, no isometric view, and no cinematic angle.

The scene is a rectangular playable forest sanctuary occupying the entire frame. It should feel like a professionally designed RPG level with excellent gameplay readability.

The terrain must appear completely seamless. There must be no visible tile borders, no checkerboard pattern, no square outlines, no grid overlay, and no indication of individual tiles. The underlying tile system is invisible. The ground should look naturally continuous while remaining suitable for game level design.

The playable boundary is created entirely by dense forest vegetation instead of walls. Thick evergreen shrubs, thorny bushes, ivy, moss, twisted roots, ferns, black roses, and low forest plants naturally define the edge of the map. Large tree trunks remain mostly outside the frame, with only subtle roots and lower foliage extending into the playable area. The forest should feel deep and ancient without enclosing the scene like a circular clearing.

The center contains an elegant ancient floral stone emblem partially covered by moss. The carving is weathered and faded with subtle pale-gold details. It feels sacred but dormant. No glow, no magical aura, no light rays.

The ground consists of soft moss, aged stone paving, worn grass, patches of earth, scattered crimson rose petals, tiny white mushrooms, and small wild flowers. Cracked stone paths blend naturally into the moss instead of forming obvious roads.

Decorative elements include broken stone pillars, fragmented ruins, collapsed monuments, vine-covered relics, and ancient stones reclaimed by roots. Decorations are subtle and never block the central playable space.

The composition is perfectly balanced and symmetrical with broad open walkable areas. Objects are carefully arranged using professional RPG level design principles with consistent spacing and clean navigation. The map should feel intentionally designed for gameplay rather than naturally generated.

Lighting is soft overcast daylight with gentle ambient illumination. Slight mist appears only near the outer vegetation. No bloom, no god rays, no dramatic shadows, no cinematic lighting.

Pixel art only.

High-end handcrafted 16-bit RPG aesthetic.

Inspired by Chrono Trigger, Eastward, Children of Morta, Hyper Light Drifter, and premium modern indie pixel games.

Hard clean pixel edges.

Consistent pixel density.

Limited muted color palette.

Dark forest green.

Deep moss green.

Cream-colored weathered stone.

Dried blood-red roses.

Soft fog grey.

Warm faded gold accents.

The entire image should resemble a production-quality commercial RPG game background created by a professional pixel artist.

Environment only.

No characters.

No enemies.

No NPCs.

No animals.

No houses.

No castles.

No walls.

No fences.

No buildings.

No bridges.

No rivers.

No lakes.

No waterfalls.

No cliffs.

No mountains.

No tree stumps.

No logs.

No fallen branches.

No oversized rocks.

No glowing objects.

No magical effects.

No UI.

No HUD.

No text.

No logo.

No watermark.

No border.

No vignette.

No visible tile borders.

No checkerboard.

No square grid.

No pixel grid overlay.

No tiled texture repetition.

The final image should look like a seamless handcrafted RPG game level ready to be placed directly into The 11th Forest.`
    },
] as const;