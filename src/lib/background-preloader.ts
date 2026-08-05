/**
 * src/lib/background-preloader.ts
 * --------------------------------------------------------------------------
 * Background Scene Asset Preloader Service.
 *
 * Listens for `current-scene-ready` on the EventBus. Once the initial scene
 * has booted and rendered, waits during idle time to resolve and pre-fetch
 * assets for subsequent scenes (level YAMLs, background images, sprite sheets,
 * audio). The pre-fetched assets populate the browser's HTTP cache, allowing
 * Phaser to load them instantly upon scene transitions.
 */

import { EventBus } from '@/lib/events/bus';
import { fetchLevelIndex } from '@/lib/levels/loader';
import { resolveScene } from '@/game/resolve-scene';

/** Track scene IDs that have already been loaded or preloaded. */
const preloadedSceneIds = new Set<string>();

/** Track individual asset URLs that have already been pre-fetched. */
const preloadedUrls = new Set<string>();

/** Prevent parallel preloading loops. */
let isPreloading = false;

/** Ensure event listener is registered only once. */
let isInitialized = false;

/** Preload candidate URLs sequentially to keep network bandwidth usage low. */
async function prefetchUrl(url: string, type: 'image' | 'audio'): Promise<void> {
    if (!url) return;
    const normalizedUrl = url.startsWith('/') ? url : `/${url}`;

    // Skip if this exact URL has already been pre-fetched
    if (preloadedUrls.has(normalizedUrl)) return;
    preloadedUrls.add(normalizedUrl);

    try {
        if (type === 'image') {
            await new Promise<void>((resolve) => {
                const img = new Image();
                img.onload = () => resolve();
                img.onerror = () => resolve(); // Non-blocking fail
                img.src = normalizedUrl;
            });
        } else {
            await fetch(normalizedUrl, { cache: 'force-cache' }).catch(() => {});
        }
    } catch {
        // Silently swallow prefetch failures
    }
}

/**
 * Preloads all assets for a given target scene ID into browser cache.
 */
async function preloadTargetScene(sceneId: string): Promise<void> {
    if (preloadedSceneIds.has(sceneId)) return;
    preloadedSceneIds.add(sceneId);

    try {
        const resolved = await resolveScene(sceneId);

        // Collect all image & audio asset URLs for this scene
        const imageUrls = new Set<string>();
        const audioUrls = new Set<string>();

        // 1. Background image
        if (resolved.level.background) {
            imageUrls.add(resolved.level.background);
        }

        // 2. Main Character sprite
        if (resolved.character.sprite?.texture) {
            imageUrls.add(resolved.character.sprite.texture);
        }

        // 3. Monsters
        for (const monster of resolved.monsters.values()) {
            if (monster.sprite?.texture) {
                imageUrls.add(monster.sprite.texture);
            }
        }

        // 4. Drops
        for (const drop of resolved.drops.values()) {
            if (drop.sprite?.texture) {
                imageUrls.add(drop.sprite.texture);
            }
        }

        // 5. Weapons & Bullets
        for (const weapon of resolved.weaponsById.values()) {
            if (weapon.visual?.texture) {
                imageUrls.add(weapon.visual.texture);
            }
            if (weapon.bullet?.texture) {
                imageUrls.add(weapon.bullet.texture);
            }
        }

        // 6. Audio (SFX & Music)
        for (const sfx of resolved.sfx.values()) {
            if (sfx.source) {
                audioUrls.add(sfx.source);
            }
        }
        for (const music of resolved.music.values()) {
            if (music.source) {
                audioUrls.add(music.source);
            }
        }

        // Prefetch image files sequentially
        for (const imgUrl of imageUrls) {
            await prefetchUrl(imgUrl, 'image');
        }

        // Prefetch audio files sequentially
        for (const audioUrl of audioUrls) {
            await prefetchUrl(audioUrl, 'audio');
        }

        console.log(`[BackgroundPreloader] Fully pre-cached scene: ${sceneId}`);
    } catch (err) {
        console.warn(`[BackgroundPreloader] Failed to pre-cache scene ${sceneId}:`, err);
    }
}

/**
 * Triggered after current scene becomes ready.
 */
async function onCurrentSceneReady(scene: Phaser.Scene): Promise<void> {
    const currentId = scene.scene.key.replace(/^LoadScene:/, '');
    preloadedSceneIds.add(currentId);

    if (isPreloading) return;

    try {
        const index = await fetchLevelIndex();
        const candidateScenes = index.levels.filter((id) => !preloadedSceneIds.has(id));

        // If all scenes are already loaded/preloaded, do nothing
        if (candidateScenes.length === 0) {
            return;
        }

        isPreloading = true;

        // Delay preloading by 2 seconds to ensure initial game rendering and UI settle
        setTimeout(async () => {
            try {
                for (const nextSceneId of candidateScenes) {
                    await preloadTargetScene(nextSceneId);
                }
            } catch (err) {
                console.warn('[BackgroundPreloader] Error preloading candidate scenes:', err);
            } finally {
                isPreloading = false;
            }
        }, 2000);
    } catch (err) {
        console.warn('[BackgroundPreloader] Error fetching level index:', err);
    }
}

/**
 * Initializes the background preloader event listener.
 * Single registration only.
 */
export function initBackgroundPreloader(): void {
    if (isInitialized) return;
    isInitialized = true;
    EventBus.on('current-scene-ready', onCurrentSceneReady);
}
