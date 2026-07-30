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
                        points: z
                            .array(z.tuple([z.number(), z.number()]))
                            .min(3),
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
    })
    .strict();

function formatZodIssues(issues) {
    return issues
        .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('; ');
}

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
        payload.dropSpawns = level.dropSpawns.map((d) => ({
            type: d.type,
            x: d.x,
            y: d.y,
        }));
    }
    if (level.materials !== undefined) payload.materials = level.materials;
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
    return sendJson(res, 200, { ok: true, path: path.relative(path.resolve(__dirname, '../..'), outPath) });
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
                const images = files.filter((f) => /\.(png|jpe?g|webp)$/i.test(f) && f !== 'raw.png');
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
            const text = await readFile(
                path.join(PUBLIC_DIR, 'data/levels', `${id}.yaml`),
                'utf8',
            );
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
`;

async function handleCreateScene(req, res) {
    const { id, title } = await readJsonBody(req);
    if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
        return sendJson(res, 400, { error: `invalid id: ${JSON.stringify(id)}` });
    }
    const safeTitle = typeof title === 'string' && title.length > 0
        ? title.replace(/[\r\n]/g, ' ')
        : id;

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
        const text = await readFile(
            path.join(PUBLIC_DIR, 'data/levels', `${id}.yaml`),
            'utf8',
        );
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
 * List every monster id from public/data/monsters/index.yaml. The
 * Monsters sub-tab uses this to populate its type dropdown.
 */
async function handleListMonsterTypes(res) {
    try {
        const indexPath = path.join(PUBLIC_DIR, 'data/monsters/index.yaml');
        const text = await readFile(indexPath, 'utf8');
        const idx = parseYaml(text) || {};
        const types = Array.isArray(idx.monsters) ? idx.monsters : [];
        return sendJson(res, 200, { types });
    } catch {
        return sendJson(res, 200, { types: [] });
    }
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
        },
    };
}