/**
 * scripts/generate-image.ts
 * --------------------------------------------------------------------------
 * Generate one image via the local Gemini-compatible proxy (OpenAI-shape
 * client). Supports text-to-image and image-to-image.
 *
 * Run:
 *   pnpm tsx scripts/generate-image.ts                                   # t2i, default prompt
 *   pnpm tsx scripts/generate-image.ts --prompt "red forest boss"        # t2i
 *   pnpm tsx scripts/generate-image.ts --size 1280x720                   # t2i w/ size
 *   pnpm tsx scripts/generate-image.ts --image tmp/image/bg.png          # i2i
 *   pnpm tsx scripts/generate-image.ts --scene 1                         # scene 1 from prompts/scenes.ts
 *   pnpm tsx scripts/generate-image.ts --scene-id outer-forest-scene     # same, by id
 *   pnpm tsx scripts/generate-image.ts --scene 1 --image bg.png         # i2i with scene body
 *
 * Resolution (highest wins):
 *   1. explicit --prompt / --size / --image
 *   2. scene entry (from --scene or --scene-id)
 *   3. env / positional defaults
 *
 * Env (loaded from .env then .env.local; .env.local wins):
 *   GEMINI_ENDPOINT  e.g. http://127.0.0.1:8045/v1
 *   GEMINI_API_KEY   the proxy key
 *   GEMINI_MODEL     e.g. gemini-3.1-flash-image
 */

import OpenAI from 'openai';
import { config as loadEnv } from 'dotenv';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, extname } from 'node:path';
import { scenes } from '../prompts/scenes';

// Load .env first (shared defaults, committed), then .env.local (personal
// secrets, gitignored). `override:true` makes local win on key clashes.
// dotenv silently ignores missing files — both can be absent during dev.
loadEnv(); // .env
loadEnv({ path: '.env.local', override: true }); // .env.local

// Minimal CLI flag parser: `--key value` and `--flag`. Positional args are
// collected into `_positional`. Keeps the script zero-dep on top of
// `openai` / `tsx` / `dotenv`.
function parseArgs(argv: string[]): { flags: Record<string, string | boolean>; positional: string[] } {
    const flags: Record<string, string | boolean> = {};
    const positional: string[] = [];
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a.startsWith('--')) {
            const key = a.slice(2);
            const next = argv[i + 1];
            if (next !== undefined && !next.startsWith('--')) {
                flags[key] = next;
                i++;
            } else {
                flags[key] = true;
            }
        } else {
            positional.push(a);
        }
    }
    return { flags, positional };
}

type Kind = 'image' | 'music';

type MainOpts = {
    kind: Kind;
    prompt: string;
    size: string;
    imagePath?: string;
};

async function generateImage(opts: MainOpts): Promise<void> {
    const endpoint = process.env.GEMINI_ENDPOINT ?? 'http://127.0.0.1:8045/v1';
    const apiKey = process.env.GEMINI_API_KEY ?? '';
    const model = process.env.GEMINI_MODEL ?? 'gemini-3.1-flash-image';

    if (!apiKey) throw new Error('GEMINI_API_KEY is empty — set it in .env or .env.local');

    const client = new OpenAI({ baseURL: endpoint, apiKey });

    const userContent = buildUserContent(opts);

    // ponytail: openai SDK v6 doesn't type `extra_body`; Gemini-compatible
    // proxies read it as-is. Bypass the strict type — the JSON wire format
    // is unaffected.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const params: any = {
        model,
        messages: [{ role: 'user', content: userContent }],
        extra_body: { size: opts.size },
    };

    const res = await client.chat.completions.create(params);

    type Choice = {
        message?: {
            content?:
            | string
            | Array<{ type?: string; text?: string; image_url?: { url?: string } }>;
        };
    };
    const content = (res.choices as Choice[])[0]?.message?.content;

    console.log('--- raw content ---');
    console.log(typeof content === 'string' ? content : JSON.stringify(content, null, 2));

    let dataUrl: string | undefined;
    if (typeof content === 'string') {
        dataUrl = content.match(/data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+/)?.[0];
    } else if (Array.isArray(content)) {
        for (const part of content) {
            const u = part.image_url?.url;
            if (u?.startsWith('data:image/')) {
                dataUrl = u;
                break;
            }
        }
    }

    if (!dataUrl) {
        console.error('\nNo image data-URL in response.');
        process.exit(1);
    }

    const base64 = dataUrl.split(',', 2)[1];
    const bytes = Buffer.from(base64, 'base64');
    const outName = `${model}-${Date.now()}.png`;
    const outPath = `./tmp/image/${outName}`;
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, bytes);
    console.log(`\nSaved ${bytes.length} bytes -> ${outPath}`);
}

function buildUserContent(opts: MainOpts): string | Array<Record<string, unknown>> {
    if (!opts.imagePath) return opts.prompt;

    const ext = extname(opts.imagePath).slice(1).toLowerCase() || 'png';
    const mime = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
    const b64 = readFileSync(opts.imagePath).toString('base64');
    const dataUrl = `data:${mime};base64,${b64}`;

    return [
        ...(opts.prompt ? [{ type: 'text' as const, text: opts.prompt }] : []),
        { type: 'image_url' as const, image_url: { url: dataUrl } },
    ];
}

function resolveScene(flags: Record<string, string | boolean>): (typeof scenes)[number] | undefined {
    const sceneIdx = flags.scene as string | undefined;
    const sceneId = flags['scene-id'] as string | undefined;
    if (sceneIdx !== undefined) {
        const n = Number(sceneIdx);
        const found = scenes.find((s) => s.number === n);
        if (!found) throw new Error(`No scene with number=${n}. Available: ${scenes.map((s) => s.number).join(', ')}`);
        return found;
    }
    if (sceneId !== undefined) {
        const found = scenes.find((s) => s.id === sceneId);
        if (!found) throw new Error(`No scene with id=${sceneId}. Available: ${scenes.map((s) => s.id).join(', ')}`);
        return found;
    }
    return undefined;
}

const { flags, positional } = parseArgs(process.argv.slice(2));

const scene = resolveScene(flags);

// Resolution: explicit flag > scene entry > default
const kind = ((flags.kind as Kind | undefined) ?? scene?.kind ?? 'image') as Kind;
const prompt =
    (flags.prompt as string | undefined) ?? positional[0] ?? scene?.prompt ?? 'Draw a futuristic city';
const size = (flags.size as string | undefined) ?? (scene && 'size' in scene ? scene.size : undefined) ?? '1024x1024';
const imagePath = flags.image as string | undefined;

if (kind === 'music') {
    console.error('Music generation not implemented yet. Use --kind image.');
    process.exit(2);
}

generateImage({ kind, prompt, size, imagePath }).catch((err) => {
    console.error(err);
    process.exit(1);
});