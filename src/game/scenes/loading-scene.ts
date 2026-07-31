/**
 * src/game/scenes/loading-scene.ts
 * --------------------------------------------------------------------------
 * Pre-game loading screen.
 *
 * Runs before LoadScene. Renders a custom progress bar (cyan fill +
 * dark frame) with two curves driving it:
 *
 *   - fake:  ramps 0 → 0.85 over ~3s via a 80ms timer. Keeps the bar
 *            feeling responsive even when the real loader hasn't
 *            pushed its first chunk yet.
 *   - real:  Phaser's loader progress (0..1 from bytes downloaded).
 *            Always wins once it catches up; the bar jumps to 1.0 on
 *            'complete'.
 *
 * Displayed value = max(fake, real). Pure helper in
 * `loading-progress.ts` does the fake arithmetic so it's unit-tested.
 *
 * Asset loading is queued inside create() (not preload()) on purpose:
 * create() runs immediately and draws the bar; queueing from create()
 * then calling `this.load.start()` kicks off downloads in the
 * background while the bar animates.
 *
 * On complete: dynamically register a fresh LoadScene keyed by scene
 * id, then stop this loader.
 */

import * as Phaser from 'phaser';

import { loadAudioAssets } from '@/game/audios/logic';
import type { SoundSpec } from '@/lib/audios';
import { loadCharacterAssets } from '@/game/characters/character';
import { loadDropAssets } from '@/game/drops/drop';
import { MaterialManager } from '@/game/materials/material';
import { loadMonsterAssets } from '@/game/monsters/monster';
import type { MonsterSpec } from '@/lib/monsters';
import { loadWeaponAssets } from '@/game/weapons/weapon';
import { getCachedResolvedScene, type ResolvedScene } from '@/game/resolve-scene';

import { FAKE_STEP_MS, nextFakeProgress } from './loading-progress';
import { LoadScene, type SceneAssets } from './scene';

async function getMonsterSpriteCellDims(
    spec: MonsterSpec,
): Promise<{ width: number; height: number }> {
    const sprite = spec.sprite;
    const grid = sprite?.grid;
    if (!sprite || !grid) return { width: 0, height: 0 };
    const url = sprite.texture.startsWith('/') ? sprite.texture : `/${sprite.texture}`;
    const natural = await new Promise<{ width: number; height: number }>(
        (resolve, reject) => {
            const img = new Image();
            img.onload = () =>
                resolve({ width: img.naturalWidth, height: img.naturalHeight });
            img.onerror = () => reject(new Error(`Failed to load ${url}`));
            img.src = url;
        },
    );
    return {
        width: Math.floor(natural.width / grid.cols),
        height: Math.floor(natural.height / grid.rows),
    };
}

const BAR_WIDTH = 480;
const BAR_HEIGHT = 18;
const BAR_COLOR_FILL = 0x06b6d4; // cyan-500 — matches Editor button
const BAR_COLOR_FRAME = 0x404040;
const BAR_COLOR_BG = 0x0a0a0a;
const BAR_INSET = 3;
const HOLD_MS_AFTER_FULL = 250;

export class LoadingScene extends Phaser.Scene {
    constructor() {
        super('LoadingScene');
    }

    create(): void {
        const resolved = getCachedResolvedScene();
        if (!resolved) {
            this.add
                .text(
                    this.cameras.main.width / 2,
                    this.cameras.main.height / 2,
                    'No scene to load',
                    { fontFamily: 'monospace', fontSize: '14px', color: '#f87171' },
                )
                .setOrigin(0.5);
            return;
        }

        // ─── Progress bar UI ────────────────────────────────────────
        const cam = this.cameras.main;
        const cx = cam.width / 2;
        const cy = cam.height / 2;
        const x0 = cx - BAR_WIDTH / 2;
        const y0 = cy - BAR_HEIGHT / 2;

        const frame = this.add.graphics();
        frame.fillStyle(BAR_COLOR_BG, 0.85).fillRect(x0, y0, BAR_WIDTH, BAR_HEIGHT);
        frame.lineStyle(2, BAR_COLOR_FRAME, 1).strokeRect(x0, y0, BAR_WIDTH, BAR_HEIGHT);

        const fill = this.add.graphics();
        const updateBar = (progress: number) => {
            fill.clear();
            fill.fillStyle(BAR_COLOR_FILL, 1).fillRect(
                x0 + BAR_INSET,
                y0 + BAR_INSET,
                (BAR_WIDTH - 2 * BAR_INSET) * Math.min(1, Math.max(0, progress)),
                BAR_HEIGHT - 2 * BAR_INSET,
            );
        };
        updateBar(0);

        // "Loading..." caption above the bar
        const caption = this.add
            .text(cx, y0 - 14, 'Loading the forest…', {
                fontFamily: 'monospace',
                fontSize: '13px',
                color: '#a3a3a3',
            })
            .setOrigin(0.5);

        // Percent label below the bar
        const percent = this.add
            .text(cx, y0 + BAR_HEIGHT + 14, '0%', {
                fontFamily: 'monospace',
                fontSize: '12px',
                color: '#737373',
            })
            .setOrigin(0.5);

        // ─── Progress drivers ───────────────────────────────────────
        let realProgress = 0;
        let fakeProgress = 0;
        let lastFakeTickAt = this.time.now;
        let completed = false;

        const draw = (p: number) => {
            updateBar(p);
            percent.setText(`${Math.round(p * 100)}%`);
        };

        this.load.on('progress', (p: number) => {
            realProgress = p;
            if (!completed) draw(Math.max(realProgress, fakeProgress));
        });

        const fakeTimer = this.time.addEvent({
            delay: FAKE_STEP_MS,
            loop: true,
            callback: () => {
                if (completed) return;
                const now = this.time.now;
                fakeProgress = nextFakeProgress(fakeProgress, now - lastFakeTickAt);
                lastFakeTickAt = now;
                draw(Math.max(realProgress, fakeProgress));
            },
        });

        // ─── Queue + start the actual load ──────────────────────────
        this.queueAssets(resolved);

        this.load.once('complete', () => {
            completed = true;
            fakeTimer.remove();
            realProgress = 1;
            draw(1);
            caption.setColor('#86efac'); // green-300 — "ready"

            // Brief hold so the user sees the bar reach 100% before
            // the world appears; less jarring than an instant cut.
            this.time.delayedCall(HOLD_MS_AFTER_FULL, () => {
                const scene = new LoadScene(
                    resolved.id,
                    resolved.level,
                    toSceneAssets(resolved),
                );
                this.scene.add(`LoadScene:${resolved.id}`, scene, true);
                this.scene.stop();
            });
        });

        // Kick the loader (preload() would do this for free; we queue
        // from create() so the bar is rendered first).
        this.load.start();
    }

    /**
     * Queue every asset the game needs onto Phaser's loader. Pure
     * queueing — actual downloads start on `this.load.start()` so the
     * bar can render before any network IO blocks.
     */
    private queueAssets(resolved: ResolvedScene): void {
        this.load.image('background', resolved.level.background);
        loadCharacterAssets(
            this,
            resolved.character,
            resolved.spriteCell.width,
            resolved.spriteCell.height,
        );
        loadMonsterAssets(
            this,
            resolved.monsters.values(),
            getMonsterSpriteCellDims,
        );
        loadDropAssets(this, resolved.drops.values());
        loadWeaponAssets(this, resolved.weaponsById.values());
        loadAudioAssets(this, [
            ...resolved.sfx.values(),
            ...resolved.music.values(),
        ] as Iterable<SoundSpec>);
        MaterialManager.preloadMaterials(this, resolved.level.materials);
    }
}

function toSceneAssets(resolved: ResolvedScene): SceneAssets {
    return {
        weapons: resolved.weapons,
        weaponsById: resolved.weaponsById,
        character: resolved.character,
        spriteCell: resolved.spriteCell,
        monsterSpecs: resolved.monsters,
        dropSpecs: resolved.drops,
        sfxSpecs: resolved.sfx,
        musicSpecs: resolved.music,
    };
}