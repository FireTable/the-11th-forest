/**
 * vite/plugins/editor-api.mjs
 * --------------------------------------------------------------------------
 * Dev-only Vite plugin exposing /api/editor/* endpoints for the in-browser
 * level editor. Not registered in vite/config.prod.mjs.
 *
 * Endpoints (all POST, JSON in / JSON out):
 *   /api/editor/save-level   body: { id: string, level: Level }
 *                            → validates level payload with a parallel
 *                              Zod schema, then writes
 *                              public/data/levels/<id>.yaml
 *                              (Vite watches public/ and triggers full reload)
 *
 * Conventions:
 *   - id MUST match /^[a-z][a-z0-9-]*$/ (rejects path traversal, dots, etc.)
 *   - YAML shape mirrors src/lib/editor/yaml.ts. Drifts are caught by
 *     scripts/validate-levels.ts on the next run.
 *
 * The save-time validator below mirrors src/lib/levels/schema.ts. We
 * can't directly import the TS schema (this file is .mjs, no tsx), so
 * the shape is duplicated. If you change one, change both.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { dump as stringifyYaml, load as parseYaml } from 'js-yaml';
import { z } from 'zod';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '../../public');
const ID_PATTERN = /^[a-z][a-z0-9-]*$/;

/**
 * Server-side mirror of src/lib/levels/schema.ts → LevelSchema.
 *
 * MUST stay in sync with the TS schema. The editor panel sends JSON
 * before serializing; this server validates the JSON shape so a typo
 * in the panel doesn't silently write a malformed YAML that the game
 * then refuses to load.
 *
 * Kept narrower than the TS schema because the editor only sends the
 * fields it knows about (no legacy rect air walls).
 */
const SaveLevelSchema = z
    .object({
        title: z.string().min(1),
        background: z.string().min(1),
        imageSize: z.union([
            z.string().regex(/^\d+x\d+$/, 'expected "WxH"'),
            z.object({ width: z.number(), height: z.number() }),
        ]),
        prompt: z.string().optional(),
        music: z.string().min(1).optional(),
        airWalls: z
            .array(
                z
                    .object({
                        id: z.string().min(1),
                        kind: z.enum(['tall', 'short']),
                        points: z.array(z.tuple([z.number(), z.number()])).min(3),
                    })
                    .strict(),
            )
            .optional(),
        character: z.string().min(1).optional(),
        characterSpawn: z
            .object({
                facing: z.enum(['left', 'right']),
                x: z.number(),
                y: z.number(),
            })
            .strict()
            .optional(),
        /** Tavern-mode flag: when true, LoadScene enters character-select
         *  mode (NPCs rendered for selection; weapon pickup capped at 3). */
        tavern: z.boolean().optional(),
        /** Tavern-mode only: per-character NPC standing positions. */
        npcSpawns: z
            .array(
                z
                    .object({
                        characterId: z.string().min(1),
                        x: z.number(),
                        y: z.number(),
                    })
                    .strict(),
            )
            .optional(),
        monsters: z
            .array(
                z
                    .object({
                        type: z.string().min(1),
                        x: z.number(),
                        y: z.number(),
                        trigger: z
                            .object({
                                kind: z.enum(['time', 'clear']),
                                delayMs: z.number().gte(0).default(0),
                                waveId: z.string().min(1).optional(),
                            })
                            .strict()
                            .optional(),
                        waveId: z.string().min(1).optional(),
                    })
                    .strict(),
            )
            .optional(),
        dropSpawns: z
            .array(
                z
                    .object({
                        type: z.string().min(1),
                        x: z.number(),
                        y: z.number(),
                        // Weapon-pickup override: lets one generic drop
                        // spec (e.g. "weapon-drop") be reused per spawn
                        // with a specific weapon id. Mirrors the TS
                        // schema in src/lib/levels/schema.ts.
                        weaponId: z.string().min(1).optional(),
                    })
                    .strict(),
            )
            .optional(),
        materials: z
            .array(
                z
                    .object({
                        id: z.string().min(1),
                        texture: z.string().min(1),
                        x: z.number(),
                        y: z.number(),
                        scale: z.number().optional(),
                        rotation: z.number().optional(),
                        flipX: z.boolean().optional(),
                        flipY: z.boolean().optional(),
                        mode: z.enum(['background', 'y-sort', 'foreground']).optional(),
                        depthOffset: z.number().optional(),
                    })
                    .strict(),
            )
            .optional(),
        teleporters: z
            .array(
                z
                    .object({
                        id: z.string().optional(),
                        x: z.number(),
                        y: z.number(),
                        targetScene: z.string().optional(),
                        radius: z.number().positive().optional(),
                    })
                    .strict(),
            )
            .optional(),
    })
    .strict();

function formatZodIssues(issues) {
    return issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
}

// ─── Server-side schema mirrors ──────────────────────────────────────────
//
// These mirror src/lib/<module>/schema.ts. The editor panel posts JSON
// before serializing; the server validates the JSON shape so a typo /
// future divergence in the panel doesn't silently write a malformed YAML
// that the game then refuses to load.
//
// Drift risk: when you add a field to the TS schema, mirror it here
// too — otherwise saves that include the new field are rejected with
// "unrecognized key" instead of being persisted.

const SpriteOffsetSchema = z
    .object({
        left: z.number().optional(),
        bottom: z.number().optional(),
        x: z.number().optional(),
        y: z.number().optional(),
    })
    .strict();

const SpriteSchema = z
    .object({
        texture: z.string().min(1),
        grid: z
            .object({
                rows: z.number().gt(0),
                cols: z.number().gt(0),
            })
            .strict()
            .optional(),
        scale: z.number().gt(0).optional(),
        offset: SpriteOffsetSchema.optional(),
        script: z
            .object({
                downsample: z.number().optional(),
                colors: z.number().optional(),
                pad: z.number().optional(),
            })
            .strict()
            .optional(),
    })
    .strict();

const AnimSpecSchema = z
    .object({
        frames: z.tuple([z.number(), z.number()]),
        frameRate: z.number().gt(0),
        repeat: z.number().optional(),
    })
    .strict();

const DropVisualSchema = z
    .object({
        size: z.number().gt(0),
        tint: z.number(),
    })
    .strict();

const DropInstantEffect = z
    .object({
        type: z.literal('instant'),
        hp: z.number().gte(0).default(0),
        sp: z.number().gte(0).default(0),
    })
    .strict();

const DropRefillAmmoEffect = z
    .object({
        type: z.literal('refill-ammo'),
        ammoFraction: z.number().gt(0).lte(1),
    })
    .strict();

const DropWeaponEffect = z
    .object({
        type: z.literal('weapon'),
        weaponId: z.string().min(1),
    })
    .strict();

const DropEffectSchema = z.discriminatedUnion('type', [
    DropInstantEffect,
    DropRefillAmmoEffect,
    DropWeaponEffect,
]);

const DropSpecSaveSchema = z
    .object({
        id: z.string().min(1).optional(),
        name: z.string().min(1),
        kind: z.enum(['static', 'monster']),
        visual: DropVisualSchema,
        effect: DropEffectSchema,
        sfx: z.string().min(1).optional(),
        throttleMs: z.number().gt(0).optional(),
        sprite: SpriteSchema.optional(),
        anims: z.record(z.string(), AnimSpecSchema).optional(),
        prompt: z.string().optional(),
    })
    .strict();

const MonsterBodySchema = z
    .object({
        halfW: z.number().gt(0).default(14),
        halfH: z.number().gt(0).default(14),
    })
    .strict()
    .default({ halfW: 14, halfH: 14 });

const MonsterDropRef = z
    .object({
        dropId: z.string().min(1),
        chance: z.number().gte(0).lte(1),
    })
    .strict();

const MonsterSfxSchema = z
    .object({
        hit: z.string().min(1).optional(),
        death: z.string().min(1).optional(),
        aggro: z.string().min(1).optional(),
        throttleMs: z.number().gt(0).optional(),
    })
    .strict();

const MonsterSpecSaveSchema = z
    .object({
        id: z.string().min(1).optional(),
        name: z.string().min(1),
        imageSize: z
            .string()
            .regex(/^\d+x\d+$/)
            .optional(),
        prompt: z.string().optional(),
        hp: z.number().gte(0),
        moveSpeed: z.number().gt(0),
        body: MonsterBodySchema,
        weaponId: z.string().min(1),
        drops: z.array(MonsterDropRef).default([]),
        sfx: MonsterSfxSchema.optional(),
        sprite: SpriteSchema.optional(),
        anims: z.record(z.string(), AnimSpecSchema).optional(),
    })
    .strict();

const ProjectileVisualSchema = z
    .object({
        radius: z.number().gt(0),
        width: z.number().gt(0),
        height: z.number().gt(0),
        color: z.number(),
    })
    .strict();

const ProjectileSchema = z
    .object({
        speed: z.number().gt(0),
        visual: ProjectileVisualSchema,
    })
    .strict();

const WeaponVisualSchema = z
    .object({
        texture: z.string().optional(),
        scale: z.number().gt(0).default(0.16),
        orbitRadius: z.number().default(16),
        anchor: z.tuple([z.number(), z.number()]).default([0.2, 0.5]),
        muzzleOffset: z.number().default(400),
        recoilDistance: z.number().default(6),
        recoilDuration: z.number().default(80),
        swingAngle: z.number().default(120),
        rotationOffset: z.number().default(0),
    })
    .strict();

const WeaponPairedBulletSchema = z
    .object({
        texture: z.string().optional(),
        type: z.enum(['projectile', 'beam', 'melee']).default('projectile'),
        speed: z.number().gt(0).optional(),
        scale: z.number().gt(0).default(1),
        color: z.string().optional(),
        beamWidth: z.number().gt(0).optional(),
        beamDuration: z.number().gt(0).optional(),
        anchor: z.tuple([z.number(), z.number()]).optional(),
        rotationOffset: z.number().optional(),
        spawnOffset: z.tuple([z.number(), z.number()]).optional(),
    })
    .strict();

const WeaponSfxSchema = z
    .object({
        shoot: z.string().min(1).optional(),
        dryFire: z.string().min(1).optional(),
        bulletWall: z.string().min(1).optional(),
        reloadStart: z.string().min(1).optional(),
        reloadFinish: z.string().min(1).optional(),
        throttleMs: z.number().gt(0).optional(),
    })
    .strict();

const WeaponSpecSaveSchema = z
    .object({
        id: z.string().min(1).optional(),
        name: z.string().min(1),
        damage: z.number().gt(0),
        cooldownMs: z.number().gte(0),
        range: z.number().gt(0),
        visual: WeaponVisualSchema.optional(),
        bullet: WeaponPairedBulletSchema.optional(),
        projectile: ProjectileSchema.optional(),
        clipSize: z.number().gt(0).optional(),
        reloadTimeMs: z.number().gt(0).optional(),
        bulletsPerShot: z.number().gt(0).optional(),
        hitWidth: z.number().gt(0).optional(),
        hitHeight: z.number().gt(0).optional(),
        sfx: WeaponSfxSchema.optional(),
    })
    .strict()
    .superRefine((val, ctx) => {
        const hasProjectile = val.projectile !== undefined;
        const hasMelee = val.hitWidth !== undefined || val.hitHeight !== undefined;
        if (hasProjectile === hasMelee) {
            ctx.addIssue({
                code: 'custom',
                message:
                    'must be either ranged (projectile) or melee (hitWidth + hitHeight), not both or neither',
            });
        }
        if (hasMelee) {
            if (val.hitWidth === undefined) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['hitWidth'],
                    message: 'melee weapon needs hitWidth',
                });
            }
            if (val.hitHeight === undefined) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['hitHeight'],
                    message: 'melee weapon needs hitHeight',
                });
            }
        }
    });

const SfxSpecSaveSchema = z
    .object({
        kind: z.literal('sfx'),
        id: z.string().min(1),
        name: z.string().min(1),
        source: z.string().min(1),
        volume: z.number().gte(0).lte(1).default(1),
        rate: z.number().gt(0).default(1),
        loop: z.boolean().default(false),
        prompt: z.string().optional(),
    })
    .strict();

const MusicSpecSaveSchema = z
    .object({
        kind: z.literal('music'),
        id: z.string().min(1),
        name: z.string().min(1),
        source: z.string().min(1),
        volume: z.number().gte(0).lte(1).default(0.5),
        fadeIn: z.number().gte(0).default(0),
        fadeOut: z.number().gte(0).default(0),
        prompt: z.string().optional(),
    })
    .strict();

const CharacterSpecSaveSchema = z
    .object({
        id: z.string().min(1),
        name: z.string().min(1),
        imageSize: z
            .string()
            .regex(/^\d+x\d+$/)
            .optional(),
        prompt: z.string().optional(),
        hp: z.number().gte(0),
        sp: z.number().gte(0),
        moveSpeed: z.number().gt(0),
        spRegenMs: z.number().gt(0),
        gender: z.enum(['male', 'female']).optional(),
        body: z
            .object({
                halfW: z.number().gt(0),
                halfH: z.number().gt(0),
            })
            .strict(),
        dodge: z
            .object({
                spCost: z.number().gte(0),
                speed: z.number().gt(0),
                durationMs: z.number().gt(0),
                cooldownMs: z.number().gt(0),
            })
            .strict(),
        hotbar: z.array(z.string().min(1)).min(1),
        sfx: z
            .object({
                dodge: z.string().min(1).optional(),
                hurt: z.string().min(1).optional(),
                hurtMale: z.string().min(1).optional(),
                hurtFemale: z.string().min(1).optional(),
                footstep: z.string().min(1).optional(),
                footstepThrottleMs: z.number().gt(0).optional(),
                lowHpHeartbeat: z.string().min(1).optional(),
                lowHpThreshold: z.number().gt(0).lte(1).optional(),
                lowHpPulseMs: z.number().gt(0).optional(),
                throttleMs: z.number().gt(0).optional(),
            })
            .strict()
            .optional(),
        sprite: z
            .object({
                texture: z.string().min(1),
                grid: z
                    .object({
                        rows: z.number().gt(0),
                        cols: z.number().gt(0),
                    })
                    .strict(),
                scale: z.number().gt(0),
                offset: SpriteOffsetSchema.optional(),
                script: z
                    .object({
                        downsample: z.number().optional(),
                        colors: z.number().optional(),
                        pad: z.number().optional(),
                    })
                    .strict()
                    .optional(),
            })
            .strict()
            .optional(),
        anims: z.record(z.string(), AnimSpecSchema).optional(),
    })
    .strict();

const MODULE_SCHEMAS = {
    drops: DropSpecSaveSchema,
    monsters: MonsterSpecSaveSchema,
    weapons: WeaponSpecSaveSchema,
    'audios-sfx': SfxSpecSaveSchema,
    'audios-music': MusicSpecSaveSchema,
};

/**
 * Server-side mirror of src/lib/editor/yaml.ts → serializeLevelYaml.
 *
 * MUST stay in sync with the client. The editor panel serializes via
 * the TS path and POSTs JSON; this server emits YAML from that JSON.
 * Diverging these two was the original bug — characterSpawn and other
 * optional fields were silently dropped here. Same shape as the client
 * implementation: every Level field emitted in the documented YAML
 * order, undefined optional fields omitted, characterSpawn / monsters /
 * dropSpawns mapped to flat { x, y }.
 */
function serializeLevelYaml(level) {
    // Normalise imageSize to "WxH" string on the server side too.
    const imageSize =
        typeof level.imageSize === 'string'
            ? level.imageSize
            : `${level.imageSize.width}x${level.imageSize.height}`;

    const payload = {
        title: level.title,
        background: level.background,
        imageSize,
        prompt: level.prompt,
        airWalls: level.airWalls,
    };
    if (level.music !== undefined) payload.music = level.music;
    if (level.character !== undefined) payload.character = level.character;
    if (level.tavern !== undefined) payload.tavern = level.tavern;
    if (level.npcSpawns !== undefined) payload.npcSpawns = level.npcSpawns;
    if (level.characterSpawn !== undefined) {
        payload.characterSpawn = {
            x: level.characterSpawn.x,
            y: level.characterSpawn.y,
            facing: level.characterSpawn.facing,
        };
    }
    if (level.monsters !== undefined) {
        payload.monsters = level.monsters.map((m) => {
            const out = { type: m.type, x: m.x, y: m.y };
            if (m.waveId !== undefined) out.waveId = m.waveId;
            if (m.trigger !== undefined) {
                const trig = { kind: m.trigger.kind, delayMs: m.trigger.delayMs };
                if (m.trigger.waveId !== undefined) trig.waveId = m.trigger.waveId;
                out.trigger = trig;
            }
            return out;
        });
    }
    if (level.dropSpawns !== undefined) {
        payload.dropSpawns = level.dropSpawns.map((d) => {
            const out = { type: d.type, x: d.x, y: d.y };
            if (d.weaponId !== undefined) out.weaponId = d.weaponId;
            return out;
        });
    }
    if (level.materials !== undefined) payload.materials = level.materials;
    if (level.teleporters !== undefined) payload.teleporters = level.teleporters;
    return stringifyYaml(payload, {
        lineWidth: -1,
        sortKeys: false,
        noRefs: true,
    });
}

function readJsonBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            if (!text) return reject(new BadRequest('empty body'));
            try {
                resolve(JSON.parse(text));
            } catch (e) {
                reject(new BadRequest(`invalid JSON: ${e.message}`));
            }
        });
        req.on('error', reject);
    });
}

class BadRequest extends Error {}

function sendJson(res, status, body) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
}

async function handleSaveLevel(req, res) {
    const { id, level } = await readJsonBody(req);
    if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
        return sendJson(res, 400, { error: `invalid id: ${JSON.stringify(id)}` });
    }
    if (!level || typeof level !== 'object') {
        return sendJson(res, 400, { error: 'level required' });
    }

    // Save-time validation: reject malformed payloads with 400 instead
    // of writing a YAML the game refuses to load. Mirrors the TS
    // LevelSchema in src/lib/levels/schema.ts.
    const result = SaveLevelSchema.safeParse(level);
    if (!result.success) {
        return sendJson(res, 400, {
            error: `level validation failed: ${formatZodIssues(result.error.issues)}`,
        });
    }

    const yaml = serializeLevelYaml(result.data);
    const outPath = path.join(PUBLIC_DIR, 'data/levels', `${id}.yaml`);
    await writeFile(outPath, yaml, 'utf8');
    return sendJson(res, 200, {
        ok: true,
        path: path.relative(path.resolve(__dirname, '../..'), outPath),
    });
}

async function handleListMaterials(res) {
    const materialsDir = path.join(PUBLIC_DIR, 'assets/image/materials');
    try {
        const { readdir } = await import('node:fs/promises');
        const entries = await readdir(materialsDir, { withFileTypes: true });
        const folders = [];
        for (const entry of entries) {
            if (entry.isDirectory()) {
                const folderName = entry.name;
                const folderPath = path.join(materialsDir, folderName);
                const files = await readdir(folderPath);
                const images = files.filter(
                    (f) => /\.(png|jpe?g|webp)$/i.test(f) && f !== 'raw.png',
                );
                folders.push({
                    name: folderName,
                    images: images.map((f) => `assets/image/materials/${folderName}/${f}`),
                });
            }
        }
        return sendJson(res, 200, { folders });
    } catch {
        return sendJson(res, 200, { folders: [] });
    }
}

/** Sprite folders the editor picker can enumerate. Each maps to a
 *  directory under `public/assets/image/<key>`. Whitelisted so the
 *  endpoint can't be pointed at arbitrary paths. */
const SPRITE_FOLDERS = {
    characters: 'assets/image/characters',
    monsters: 'assets/image/monsters',
    drops: 'assets/image/drops',
    weapons: 'assets/image/weapons',
};

async function handleListSprites(req, res) {
    const { folder } = await readJsonBody(req);
    if (typeof folder !== 'string' || !(folder in SPRITE_FOLDERS)) {
        return sendJson(res, 400, { error: `unknown folder: ${JSON.stringify(folder)}` });
    }
    const folderRel = SPRITE_FOLDERS[folder];
    const folderPath = path.join(PUBLIC_DIR, folderRel);
    try {
        const { readdir } = await import('node:fs/promises');
        const files = await readdir(folderPath);
        const sprites = files
            .filter((f) => /\.png$/i.test(f) && !/^raws?$/i.test(f))
            .map((f) => ({
                id: f.replace(/\.png$/i, ''),
                path: `${folderRel}/${f}`,
                url: `/${folderRel}/${f}`,
            }))
            .sort((a, b) => a.id.localeCompare(b.id));
        return sendJson(res, 200, { sprites });
    } catch {
        return sendJson(res, 200, { sprites: [] });
    }
}

async function handleUploadMaterial(req, res) {
    const { folder, fileData } = await readJsonBody(req);
    if (typeof folder !== 'string' || !ID_PATTERN.test(folder)) {
        return sendJson(res, 400, { error: `invalid folder name: ${JSON.stringify(folder)}` });
    }
    if (typeof fileData !== 'string' || !fileData.startsWith('data:image/')) {
        return sendJson(res, 400, { error: 'invalid image fileData (expected base64 data-URL)' });
    }

    const { mkdir, writeFile, rm } = await import('node:fs/promises');
    const { exec } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execAsync = promisify(exec);

    const base64 = fileData.split(',', 2)[1];
    const buffer = Buffer.from(base64, 'base64');

    const folderDir = path.join(PUBLIC_DIR, 'assets/image/materials', folder);
    await mkdir(folderDir, { recursive: true });

    // Temporary upload path (will be cleaned up after slicing)
    const rawPath = path.join(folderDir, 'temp-upload-raw.png');
    await writeFile(rawPath, buffer);

    // Call split-sheet.ts CLI script to cut material tiles with --append
    const projectRoot = path.resolve(__dirname, '../..');
    const cmd = `pnpm tsx scripts/split-sheet.ts "${rawPath}" "${folderDir}" --append --no-recompose`;

    try {
        await execAsync(cmd, { cwd: projectRoot });
    } catch (e) {
        console.warn('split-sheet warning/error:', e.message);
    } finally {
        // Clean up raw upload file and recomposed image if exists
        await rm(rawPath, { force: true });
        await rm(path.join(folderDir, 'raw.png'), { force: true });
        await rm(path.join(folderDir, 'recomposed.png'), { force: true });
    }

    return sendJson(res, 200, { ok: true, folder });
}

async function handleDeleteMaterialItem(req, res) {
    const { imagePath } = await readJsonBody(req);
    if (typeof imagePath !== 'string' || !imagePath.startsWith('assets/image/materials/')) {
        return sendJson(res, 400, { error: 'invalid imagePath' });
    }
    const fullPath = path.join(PUBLIC_DIR, imagePath);
    const { rm } = await import('node:fs/promises');
    await rm(fullPath, { force: true });
    return sendJson(res, 200, { ok: true });
}

// ─── Scene management (list / create / replace bg / save monsters) ──────

/**
 * Read every level yaml and return {id, title}. Cheap because the files
 * are small and the dev server caches Vite's fs reads.
 */
async function handleListScenes(res) {
    const indexPath = path.join(PUBLIC_DIR, 'data/levels/index.yaml');
    const indexText = await readFile(indexPath, 'utf8');
    const index = parseYaml(indexText);
    const ids = Array.isArray(index?.levels) ? index.levels : [];
    const scenes = [];
    for (const id of ids) {
        try {
            const text = await readFile(path.join(PUBLIC_DIR, 'data/levels', `${id}.yaml`), 'utf8');
            const level = parseYaml(text) || {};
            scenes.push({ id, title: level.title || id });
        } catch {
            scenes.push({ id, title: id });
        }
    }
    return sendJson(res, 200, { scenes });
}

const EMPTY_LEVEL_TEMPLATE = (id, title) => `title: ${title}
background: assets/image/scenes/${id}.png
imageSize: 2752x1536
airWalls: []
monsters: []
dropSpawns: []
materials: []
teleporters: []
`;

async function handleCreateScene(req, res) {
    const { id, title } = await readJsonBody(req);
    if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
        return sendJson(res, 400, { error: `invalid id: ${JSON.stringify(id)}` });
    }
    const safeTitle =
        typeof title === 'string' && title.length > 0 ? title.replace(/[\r\n]/g, ' ') : id;

    // 1. Append to index.yaml (idempotent: skip if already present).
    const indexPath = path.join(PUBLIC_DIR, 'data/levels/index.yaml');
    const indexText = await readFile(indexPath, 'utf8');
    const index = parseYaml(indexText) || { levels: [] };
    if (!Array.isArray(index.levels)) index.levels = [];
    if (!index.levels.includes(id)) {
        index.levels.push(id);
        await writeFile(indexPath, stringifyYaml(index, { lineWidth: -1, noRefs: true }), 'utf8');
    }

    // 2. Write the level yaml (overwrites if present).
    const levelPath = path.join(PUBLIC_DIR, 'data/levels', `${id}.yaml`);
    await writeFile(levelPath, EMPTY_LEVEL_TEMPLATE(id, safeTitle), 'utf8');

    return sendJson(res, 200, { ok: true, id });
}

/**
 * Receive a base64-encoded image, write to
 * `public/assets/image/scenes/<id>.png`, and report the natural pixel
 * size so the caller can decide whether `level.imageSize` needs to be
 * updated. The server does NOT auto-update the level yaml — that's the
 * editor's job, after the user confirms the size change.
 */
async function handleUploadSceneImage(req, res) {
    const { id, fileData } = await readJsonBody(req);
    if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
        return sendJson(res, 400, { error: `invalid id: ${JSON.stringify(id)}` });
    }
    if (typeof fileData !== 'string' || !fileData.startsWith('data:image/')) {
        return sendJson(res, 400, { error: 'invalid fileData (expected base64 data-URL)' });
    }

    const base64 = fileData.split(',', 2)[1];
    const buffer = Buffer.from(base64, 'base64');
    const scenesDir = path.join(PUBLIC_DIR, 'assets/image/scenes');
    await mkdir(scenesDir, { recursive: true });
    const outPath = path.join(scenesDir, `${id}.png`);
    await writeFile(outPath, buffer);

    // Read natural size via pngjs (already in devDeps via split-sheet.ts).
    const { PNG } = await import('pngjs');
    const png = PNG.sync.read(buffer);
    const naturalSize = { width: png.width, height: png.height };

    // Also report the existing level's imageSize so the caller can diff.
    let previousSize = null;
    try {
        const text = await readFile(path.join(PUBLIC_DIR, 'data/levels', `${id}.yaml`), 'utf8');
        const level = parseYaml(text);
        if (typeof level?.imageSize === 'string') {
            const m = level.imageSize.match(/^(\d+)x(\d+)$/);
            if (m) previousSize = { width: Number(m[1]), height: Number(m[2]) };
        }
    } catch {
        // level may not exist yet; that's fine
    }

    return sendJson(res, 200, {
        ok: true,
        path: `assets/image/scenes/${id}.png`,
        naturalSize,
        previousSize,
        sizeChanged:
            !previousSize ||
            previousSize.width !== naturalSize.width ||
            previousSize.height !== naturalSize.height,
    });
}

/**
 * Run scripts/split-sheet.ts against an uploaded monster sprite.
 * Stash the raw PNG in tmp/editor-uploads, shell out to split-sheet.ts
 * with --in-place (which copies the source to monsters/raws/<id>.png
 * and writes the processed sheet to monsters/<id>.png, then cleans
 * up frame-*.png + recomposed.png). Return the processed PNG's
 * natural size so the editor can back-fill sprite.texture.
 *
 * `options` (all optional, passed through to split-sheet.ts):
 *   { downsample: 4, colors: 32, pad: 2, outline: 2, dither: false }
 */
async function handleUploadMonsterSprite(req, res) {
    const { id, fileData, options = {} } = await readJsonBody(req);
    if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
        return sendJson(res, 400, { error: `invalid id: ${JSON.stringify(id)}` });
    }
    if (typeof fileData !== 'string' || !fileData.startsWith('data:image/')) {
        return sendJson(res, 400, { error: 'invalid fileData (expected base64 data-URL)' });
    }

    const base64 = fileData.split(',', 2)[1];
    const buffer = Buffer.from(base64, 'base64');

    // Save upload to a temp location for split-sheet.ts.
    const tmpDir = path.resolve(__dirname, '../../tmp/editor-uploads');
    await mkdir(tmpDir, { recursive: true });
    const tmpPath = path.join(tmpDir, `${id}-${Date.now()}.png`);
    await writeFile(tmpPath, buffer);

    // Build the split-sheet.ts flags. Defaults match the wanderer
    // production tuning so a fresh upload "just works".
    const flags = [
        '--in-place',
        `--id=${id}`,
        `--downsample=${options.downsample ?? 4}`,
        `--colors=${options.colors ?? 32}`,
        `--pad=${options.pad ?? 2}`,
        `--outline=${options.outline ?? 2}`,
    ];
    if (options.dither) flags.push('--dither');

    const projectRoot = path.resolve(__dirname, '../..');
    const cmd = `pnpm tsx scripts/split-sheet.ts "${tmpPath}" "${path.join(PUBLIC_DIR, 'assets/image/monsters')}" ${flags.join(' ')}`;

    const { exec } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execAsync = promisify(exec);

    try {
        await execAsync(cmd, { cwd: projectRoot, timeout: 120_000 });
    } catch (e) {
        // Clean up temp even on failure.
        await import('node:fs/promises').then((fs) => fs.rm(tmpPath, { force: true }));
        return sendJson(res, 500, { error: `split-sheet failed: ${String(e?.message ?? e)}` });
    }
    await import('node:fs/promises').then((fs) => fs.rm(tmpPath, { force: true }));

    // Read the processed PNG for natural size.
    const outPath = path.join(PUBLIC_DIR, 'assets/image/monsters', `${id}.png`);
    const { PNG } = await import('pngjs');
    const processed = PNG.sync.read(await readFile(outPath));

    return sendJson(res, 200, {
        ok: true,
        path: `assets/image/monsters/${id}.png`,
        naturalSize: { width: processed.width, height: processed.height },
    });
}

/**
 * Replace just the `monsters:` array in a level yaml. Cheaper than the
 * full save-level round-trip — monster waves change often during level
 * design while the rest of the level is stable.
 */
async function handleSaveMonsters(req, res) {
    const { id, monsters } = await readJsonBody(req);
    if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
        return sendJson(res, 400, { error: `invalid id: ${JSON.stringify(id)}` });
    }
    if (!Array.isArray(monsters)) {
        return sendJson(res, 400, { error: 'monsters must be an array' });
    }

    const levelPath = path.join(PUBLIC_DIR, 'data/levels', `${id}.yaml`);
    const text = await readFile(levelPath, 'utf8');
    const level = parseYaml(text) || {};
    level.monsters = monsters;
    await writeFile(levelPath, stringifyYaml(level, { lineWidth: -1, noRefs: true }), 'utf8');

    return sendJson(res, 200, { ok: true, count: monsters.length });
}

/**
 * List every monster type from public/data/monsters/index.yaml. The
 * Monsters sub-tab uses this to populate its type dropdown AND the
 * visual canvas overlay (which needs each monster's display name and
 * sprite texture path). Each entry: { id, name, texture }.
 */
async function handleListMonsterTypes(res) {
    try {
        const indexPath = path.join(PUBLIC_DIR, 'data/monsters/index.yaml');
        const text = await readFile(indexPath, 'utf8');
        const idx = parseYaml(text) || {};
        const ids = Array.isArray(idx.monsters) ? idx.monsters : [];
        const types = [];
        for (const id of ids) {
            try {
                const specText = await readFile(
                    path.join(PUBLIC_DIR, 'data/monsters', `${id}.yaml`),
                    'utf8',
                );
                const spec = parseYaml(specText) || {};
                types.push({
                    id,
                    name: typeof spec.name === 'string' ? spec.name : id,
                    texture:
                        typeof spec?.sprite?.texture === 'string'
                            ? spec.sprite.texture
                            : `assets/image/monsters/${id}.png`,
                });
            } catch {
                types.push({
                    id,
                    name: id,
                    texture: `assets/image/monsters/${id}.png`,
                });
            }
        }
        return sendJson(res, 200, { types });
    } catch {
        return sendJson(res, 200, { types: [] });
    }
}

// ─── Character management ────────────────────────────────────────────────

async function handleListCharacters(res) {
    try {
        const indexPath = path.join(PUBLIC_DIR, 'data/characters/index.yaml');
        const text = await readFile(indexPath, 'utf8');
        const idx = parseYaml(text) || {};
        const ids = Array.isArray(idx.characters) ? idx.characters : [];
        const chars = [];
        for (const id of ids) {
            try {
                const ct = await readFile(
                    path.join(PUBLIC_DIR, 'data/characters', `${id}.yaml`),
                    'utf8',
                );
                const spec = parseYaml(ct) || {};
                chars.push({ id, name: spec.name || id });
            } catch {
                chars.push({ id, name: id });
            }
        }
        return sendJson(res, 200, { characters: chars });
    } catch {
        return sendJson(res, 200, { characters: [] });
    }
}

async function handleGetCharacter(req, res) {
    const { id } = await readJsonBody(req);
    if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
        return sendJson(res, 400, { error: `invalid id: ${JSON.stringify(id)}` });
    }
    try {
        const text = await readFile(path.join(PUBLIC_DIR, 'data/characters', `${id}.yaml`), 'utf8');
        return sendJson(res, 200, { id, spec: parseYaml(text) });
    } catch {
        return sendJson(res, 404, { error: `character not found: ${id}` });
    }
}

async function handleSaveCharacter(req, res) {
    const { id, spec } = await readJsonBody(req);
    if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
        return sendJson(res, 400, { error: `invalid id: ${JSON.stringify(id)}` });
    }
    if (!spec || typeof spec !== 'object') {
        return sendJson(res, 400, { error: 'spec required' });
    }
    // Validate against the mirrored CharacterSpecSaveSchema so a typo /
    // future divergence in the editor can't silently write a YAML the
    // game refuses to load. spec.id must also match the file id — kept
    // here rather than the schema so the error message stays actionable.
    const result = CharacterSpecSaveSchema.safeParse(spec);
    if (!result.success) {
        return sendJson(res, 400, {
            error: `character validation failed: ${formatZodIssues(result.error.issues)}`,
        });
    }
    if (result.data.id !== id) {
        return sendJson(res, 400, { error: 'spec.id must match the file id' });
    }
    const out = path.join(PUBLIC_DIR, 'data/characters', `${id}.yaml`);
    await writeFile(out, stringifyYaml(result.data, { lineWidth: -1, noRefs: true }), 'utf8');
    return sendJson(res, 200, { ok: true });
}

async function handleCreateCharacter(req, res) {
    const { id, name } = await readJsonBody(req);
    if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
        return sendJson(res, 400, { error: `invalid id: ${JSON.stringify(id)}` });
    }
    const safeName = typeof name === 'string' && name.length > 0 ? name : id;

    // Append to index.yaml.
    const indexPath = path.join(PUBLIC_DIR, 'data/characters/index.yaml');
    const idxText = await readFile(indexPath, 'utf8');
    const idx = parseYaml(idxText) || { characters: [] };
    if (!Array.isArray(idx.characters)) idx.characters = [];
    if (!idx.characters.includes(id)) {
        idx.characters.push(id);
        await writeFile(indexPath, stringifyYaml(idx, { lineWidth: -1, noRefs: true }), 'utf8');
    }

    // Minimal template — the editor will fill in the rest.
    const template = {
        id,
        name: safeName,
        hp: 100,
        sp: 100,
        moveSpeed: 220,
        spRegenMs: 1000,
        body: { halfW: 28, halfH: 24 },
        dodge: { spCost: 15, speed: 14, durationMs: 220, cooldownMs: 600 },
        hotbar: ['assault-rifle'],
    };
    const out = path.join(PUBLIC_DIR, 'data/characters', `${id}.yaml`);
    await writeFile(out, stringifyYaml(template, { lineWidth: -1, noRefs: true }), 'utf8');
    return sendJson(res, 200, { ok: true, id });
}

/**
 * Run scripts/split-sheet.ts against an uploaded sprite. Splits the
 * chroma key, downsample + quantize, and writes the processed sheet to
 * `public/assets/image/characters/<id>.png`. Returns the natural pixel
 * size and detected grid for the editor to write back to the yaml.
 *
 * `options` (all optional, passed through to split-sheet.ts):
 *   { downsample: 4, colors: 32, pad: 2, outline: 2, dither: false }
 */
async function handleUploadCharacterSprite(req, res) {
    const { id, fileData, options = {} } = await readJsonBody(req);
    if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
        return sendJson(res, 400, { error: `invalid id: ${JSON.stringify(id)}` });
    }
    if (typeof fileData !== 'string' || !fileData.startsWith('data:image/')) {
        return sendJson(res, 400, { error: 'invalid fileData (expected base64 data-URL)' });
    }

    const base64 = fileData.split(',', 2)[1];
    const buffer = Buffer.from(base64, 'base64');

    // Save upload to a temp location for split-sheet.ts.
    const tmpDir = path.resolve(__dirname, '../../tmp/editor-uploads');
    await mkdir(tmpDir, { recursive: true });
    const tmpPath = path.join(tmpDir, `${id}-${Date.now()}.png`);
    await writeFile(tmpPath, buffer);

    // Build the split-sheet.ts flags. Default values match the wanderer
    // production tuning so a fresh upload "just works".
    const flags = [
        '--in-place',
        `--id=${id}`,
        `--downsample=${options.downsample ?? 4}`,
        `--colors=${options.colors ?? 32}`,
        `--pad=${options.pad ?? 2}`,
        `--outline=${options.outline ?? 2}`,
    ];
    if (options.dither) flags.push('--dither');

    const projectRoot = path.resolve(__dirname, '../..');
    const cmd = `pnpm tsx scripts/split-sheet.ts "${tmpPath}" "${path.join(PUBLIC_DIR, 'assets/image/characters')}" ${flags.join(' ')}`;

    const { exec } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execAsync = promisify(exec);

    try {
        await execAsync(cmd, { cwd: projectRoot, timeout: 120_000 });
    } catch (e) {
        // Clean up temp even on failure.
        await import('node:fs/promises').then((fs) => fs.rm(tmpPath, { force: true }));
        return sendJson(res, 500, { error: `split-sheet failed: ${String(e?.message ?? e)}` });
    }
    await import('node:fs/promises').then((fs) => fs.rm(tmpPath, { force: true }));

    // Read the processed PNG for natural size.
    const outPath = path.join(PUBLIC_DIR, 'assets/image/characters', `${id}.png`);
    const { PNG } = await import('pngjs');
    const processed = PNG.sync.read(await readFile(outPath));

    return sendJson(res, 200, {
        ok: true,
        path: `assets/image/characters/${id}.png`,
        naturalSize: { width: processed.width, height: processed.height },
    });
}

// ─── Generic module CRUD (drops / monsters / weapons / audios) ──────────

/**
 * Resolve a module slug to its directory + index field name.
 *
 * The slug mirrors `public/data/<module>/index.yaml`:
 *   drops      → drops,      dropSpec
 *   monsters   → monsters,   monsterSpec
 *   weapons    → weapons,    weaponSpec
 *   audios-sfx → audios/sfx, sfxSpec
 *   audios-music → audios/music, musicSpec
 */
const MODULE_ROOTS = {
    drops: { dir: 'data/drops', indexField: 'drops' },
    monsters: { dir: 'data/monsters', indexField: 'monsters' },
    weapons: { dir: 'data/weapons', indexField: 'weapons' },
    'audios-sfx': { dir: 'data/audios/sfx', indexField: 'sfx' },
    'audios-music': { dir: 'data/audios/music', indexField: 'music' },
};

const ID_PATTERN_GENERIC = /^[a-z][a-z0-9-]*$/;

async function handleListModule(req, res) {
    const { module: mod } = await readJsonBody(req);
    const root = MODULE_ROOTS[mod];
    if (!root) return sendJson(res, 400, { error: `unknown module: ${mod}` });
    try {
        const idxPath = path.join(
            PUBLIC_DIR,
            root.dir.split('/').slice(0, 2).join('/'),
            'index.yaml',
        );
        const text = await readFile(idxPath, 'utf8');
        const idx = parseYaml(text) || {};
        const ids = Array.isArray(idx[root.indexField]) ? idx[root.indexField] : [];
        return sendJson(res, 200, { ids });
    } catch {
        return sendJson(res, 200, { ids: [] });
    }
}

async function handleGetModuleSpec(req, res) {
    const { module: mod, id } = await readJsonBody(req);
    const root = MODULE_ROOTS[mod];
    if (!root) return sendJson(res, 400, { error: `unknown module: ${mod}` });
    if (typeof id !== 'string' || !ID_PATTERN_GENERIC.test(id)) {
        return sendJson(res, 400, { error: `invalid id: ${JSON.stringify(id)}` });
    }
    try {
        const text = await readFile(path.join(PUBLIC_DIR, root.dir, `${id}.yaml`), 'utf8');
        return sendJson(res, 200, { id, spec: parseYaml(text) });
    } catch {
        return sendJson(res, 404, { error: `${mod}/${id} not found` });
    }
}

async function handleSaveModuleSpec(req, res) {
    const { module: mod, id, spec } = await readJsonBody(req);
    const root = MODULE_ROOTS[mod];
    if (!root) return sendJson(res, 400, { error: `unknown module: ${mod}` });
    if (typeof id !== 'string' || !ID_PATTERN_GENERIC.test(id)) {
        return sendJson(res, 400, { error: `invalid id: ${JSON.stringify(id)}` });
    }
    if (!spec || typeof spec !== 'object') {
        return sendJson(res, 400, { error: 'spec required' });
    }
    const schema = MODULE_SCHEMAS[mod];
    if (!schema) {
        return sendJson(res, 400, { error: `no validator registered for module: ${mod}` });
    }
    const result = schema.safeParse(spec);
    if (!result.success) {
        return sendJson(res, 400, {
            error: `${mod} validation failed: ${formatZodIssues(result.error.issues)}`,
        });
    }
    const out = path.join(PUBLIC_DIR, root.dir, `${id}.yaml`);
    await writeFile(out, stringifyYaml(result.data, { lineWidth: -1, noRefs: true }), 'utf8');
    return sendJson(res, 200, { ok: true });
}

async function handleCreateModuleSpec(req, res) {
    const { module: mod, id, spec } = await readJsonBody(req);
    const root = MODULE_ROOTS[mod];
    if (!root) return sendJson(res, 400, { error: `unknown module: ${mod}` });
    if (typeof id !== 'string' || !ID_PATTERN_GENERIC.test(id)) {
        return sendJson(res, 400, { error: `invalid id: ${JSON.stringify(id)}` });
    }
    if (!spec || typeof spec !== 'object') {
        return sendJson(res, 400, { error: 'spec required' });
    }
    const schema = MODULE_SCHEMAS[mod];
    if (!schema) {
        return sendJson(res, 400, { error: `no validator registered for module: ${mod}` });
    }
    const result = schema.safeParse(spec);
    if (!result.success) {
        return sendJson(res, 400, {
            error: `${mod} validation failed: ${formatZodIssues(result.error.issues)}`,
        });
    }
    // Append to index.yaml
    const idxPath = path.join(PUBLIC_DIR, root.dir.split('/').slice(0, 2).join('/'), 'index.yaml');
    const idxText = await readFile(idxPath, 'utf8');
    const idx = parseYaml(idxText) || {};
    if (!Array.isArray(idx[root.indexField])) idx[root.indexField] = [];
    if (!idx[root.indexField].includes(id)) {
        idx[root.indexField].push(id);
        await writeFile(idxPath, stringifyYaml(idx, { lineWidth: -1, noRefs: true }), 'utf8');
    }
    const out = path.join(PUBLIC_DIR, root.dir, `${id}.yaml`);
    await writeFile(out, stringifyYaml(result.data, { lineWidth: -1, noRefs: true }), 'utf8');
    return sendJson(res, 200, { ok: true });
}

export function editorApiPlugin() {
    return {
        name: 'editor-api',
        configureServer(server) {
            server.middlewares.use('/api/editor/save-level', async (req, res, next) => {
                if (req.method !== 'POST') return next();
                try {
                    await handleSaveLevel(req, res);
                } catch (e) {
                    const status = e instanceof BadRequest ? 400 : 500;
                    sendJson(res, status, { error: String(e?.message ?? e) });
                }
            });
            server.middlewares.use('/api/editor/list-materials', async (req, res, next) => {
                if (req.method !== 'GET' && req.method !== 'POST') return next();
                try {
                    await handleListMaterials(res);
                } catch (e) {
                    sendJson(res, 500, { error: String(e?.message ?? e) });
                }
            });
            server.middlewares.use('/api/editor/upload-material', async (req, res, next) => {
                if (req.method !== 'POST') return next();
                try {
                    await handleUploadMaterial(req, res);
                } catch (e) {
                    sendJson(res, 500, { error: String(e?.message ?? e) });
                }
            });
            server.middlewares.use('/api/editor/delete-material-item', async (req, res, next) => {
                if (req.method !== 'POST') return next();
                try {
                    await handleDeleteMaterialItem(req, res);
                } catch (e) {
                    sendJson(res, 500, { error: String(e?.message ?? e) });
                }
            });
            server.middlewares.use('/api/editor/list-scenes', async (req, res, next) => {
                if (req.method !== 'GET') return next();
                try {
                    await handleListScenes(res);
                } catch (e) {
                    sendJson(res, 500, { error: String(e?.message ?? e) });
                }
            });
            server.middlewares.use('/api/editor/create-scene', async (req, res, next) => {
                if (req.method !== 'POST') return next();
                try {
                    await handleCreateScene(req, res);
                } catch (e) {
                    sendJson(res, 500, { error: String(e?.message ?? e) });
                }
            });
            server.middlewares.use('/api/editor/upload-scene-image', async (req, res, next) => {
                if (req.method !== 'POST') return next();
                try {
                    await handleUploadSceneImage(req, res);
                } catch (e) {
                    sendJson(res, 500, { error: String(e?.message ?? e) });
                }
            });
            server.middlewares.use('/api/editor/upload-monster-sprite', async (req, res, next) => {
                if (req.method !== 'POST') return next();
                try {
                    await handleUploadMonsterSprite(req, res);
                } catch (e) {
                    sendJson(res, 500, { error: String(e?.message ?? e) });
                }
            });
            server.middlewares.use('/api/editor/save-monsters', async (req, res, next) => {
                if (req.method !== 'POST') return next();
                try {
                    await handleSaveMonsters(req, res);
                } catch (e) {
                    sendJson(res, 500, { error: String(e?.message ?? e) });
                }
            });
            server.middlewares.use('/api/editor/list-monster-types', async (req, res, next) => {
                if (req.method !== 'GET') return next();
                try {
                    await handleListMonsterTypes(res);
                } catch (e) {
                    sendJson(res, 500, { error: String(e?.message ?? e) });
                }
            });
            server.middlewares.use('/api/editor/list-characters', async (req, res, next) => {
                if (req.method !== 'GET') return next();
                try {
                    await handleListCharacters(res);
                } catch (e) {
                    sendJson(res, 500, { error: String(e?.message ?? e) });
                }
            });
            server.middlewares.use('/api/editor/get-character', async (req, res, next) => {
                if (req.method !== 'POST') return next();
                try {
                    await handleGetCharacter(req, res);
                } catch (e) {
                    sendJson(res, 500, { error: String(e?.message ?? e) });
                }
            });
            server.middlewares.use('/api/editor/save-character', async (req, res, next) => {
                if (req.method !== 'POST') return next();
                try {
                    await handleSaveCharacter(req, res);
                } catch (e) {
                    sendJson(res, 500, { error: String(e?.message ?? e) });
                }
            });
            server.middlewares.use('/api/editor/create-character', async (req, res, next) => {
                if (req.method !== 'POST') return next();
                try {
                    await handleCreateCharacter(req, res);
                } catch (e) {
                    sendJson(res, 500, { error: String(e?.message ?? e) });
                }
            });
            server.middlewares.use(
                '/api/editor/upload-character-sprite',
                async (req, res, next) => {
                    if (req.method !== 'POST') return next();
                    try {
                        await handleUploadCharacterSprite(req, res);
                    } catch (e) {
                        sendJson(res, 500, { error: String(e?.message ?? e) });
                    }
                },
            );
            server.middlewares.use('/api/editor/list-module', async (req, res, next) => {
                if (req.method !== 'POST') return next();
                try {
                    await handleListModule(req, res);
                } catch (e) {
                    sendJson(res, 500, { error: String(e?.message ?? e) });
                }
            });
            server.middlewares.use('/api/editor/get-module-spec', async (req, res, next) => {
                if (req.method !== 'POST') return next();
                try {
                    await handleGetModuleSpec(req, res);
                } catch (e) {
                    sendJson(res, 500, { error: String(e?.message ?? e) });
                }
            });
            server.middlewares.use('/api/editor/save-module-spec', async (req, res, next) => {
                if (req.method !== 'POST') return next();
                try {
                    await handleSaveModuleSpec(req, res);
                } catch (e) {
                    sendJson(res, 500, { error: String(e?.message ?? e) });
                }
            });
            server.middlewares.use('/api/editor/create-module-spec', async (req, res, next) => {
                if (req.method !== 'POST') return next();
                try {
                    await handleCreateModuleSpec(req, res);
                } catch (e) {
                    sendJson(res, 500, { error: String(e?.message ?? e) });
                }
            });
            server.middlewares.use('/api/editor/list-sprites', async (req, res, next) => {
                if (req.method !== 'POST') return next();
                try {
                    await handleListSprites(req, res);
                } catch (e) {
                    sendJson(res, 500, { error: String(e?.message ?? e) });
                }
            });
        },
    };
}
