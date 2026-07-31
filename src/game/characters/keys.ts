/**
 * src/game/characters/keys.ts
 * --------------------------------------------------------------------------
 * Pure Phaser-key derivation for the character module. Kept Phaser-free
 * so Node tests (which import logic.ts and pull these helpers along) don't
 * inadvertently load Phaser and trip on `window is not defined`.
 */

/** Phaser texture key for the character's sprite sheet. */
export function textureKey(spec: Pick<{ id: string }, 'id'>): string {
    return `${spec.id}-sheet`;
}

/** Phaser animation key for a named animation on the character. */
export function animKey(spec: Pick<{ id: string }, 'id'>, name: string): string {
    return `${spec.id}-${name}`;
}
