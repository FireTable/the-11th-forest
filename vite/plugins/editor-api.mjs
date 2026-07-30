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
import { writeFile } from 'node:fs/promises';
import { dump as stringifyYaml } from 'js-yaml';
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
        payload.monsters = level.monsters.map((m) => ({
            type: m.type,
            x: m.x,
            y: m.y,
        }));
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
        },
    };
}