/**
 * vite/plugins/editor-api.mjs
 * --------------------------------------------------------------------------
 * Dev-only Vite plugin exposing /api/editor/* endpoints for the in-browser
 * level editor. Not registered in vite/config.prod.mjs.
 *
 * Endpoints (all POST, JSON in / JSON out):
 *   /api/editor/save-level   body: { id: string, level: Level }
 *                            → writes public/data/levels/<id>.yaml
 *                              (Vite watches public/ and triggers full reload)
 *
 * Conventions:
 *   - id MUST match /^[a-z][a-z0-9-]*$/ (rejects path traversal, dots, etc.)
 *   - YAML shape mirrors src/lib/editor/yaml.ts. Drifts are caught by
 *     scripts/validate-levels.ts on the next run.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { dump as stringifyYaml } from 'js-yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '../../public');
const ID_PATTERN = /^[a-z][a-z0-9-]*$/;

/**
 * Server-side mirror of src/lib/editor/yaml.ts → serializeLevelYaml.
 *
 * MUST stay in sync with the client. The editor panel serializes via
 * the TS path and POSTs JSON; this server emits YAML from that JSON.
 * Diverging these two was the original bug — characterSpawn and other
 * optional fields were silently dropped here. Same shape as the client
 * implementation: every Level field emitted in the documented YAML
 * order, undefined optional fields omitted, characterSpawn mapped to
 * { at: [x, y], facing }.
 */
function serializeLevelYaml(level) {
    const payload = {
        title: level.title,
        background: level.background,
        imageSize: `${level.imageSize.width}x${level.imageSize.height}`,
        promptFile: level.promptFile,
        airWalls: level.airWalls,
    };
    if (level.character !== undefined) payload.character = level.character;
    if (level.characterSpawn !== undefined) {
        payload.characterSpawn = {
            at: [level.characterSpawn.x, level.characterSpawn.y],
            facing: level.characterSpawn.facing,
        };
    }
    if (level.monsters !== undefined) payload.monsters = level.monsters;
    if (level.dropSpawns !== undefined) payload.dropSpawns = level.dropSpawns;
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
    const yaml = serializeLevelYaml(level);
    const outPath = path.join(PUBLIC_DIR, 'data/levels', `${id}.yaml`);
    await writeFile(outPath, yaml, 'utf8');
    return sendJson(res, 200, { ok: true, path: path.relative(path.resolve(__dirname, '../..'), outPath) });
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
        },
    };
}