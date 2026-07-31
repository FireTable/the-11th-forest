/**
 * scripts/elevenlabs-sfx.ts
 * --------------------------------------------------------------------------
 * Batch-generate SFX via ElevenLabs' `/v1/sound-generation` endpoint.
 *
 * Source of truth:
 *   - public/data/audios/index.yaml       — list of sfx ids to ship
 *   - public/data/audios/sfx/<id>.yaml    — per-sfx spec, including the
 *                                           `prompt:` field used here
 *
 * This mirrors how music is generated: `mmx music generate` reads the
 * `prompt:` from `public/data/audios/music/<id>.yaml`. Same pattern.
 *
 * Run:
 *   pnpm tsx scripts/elevenlabs-sfx.ts            # generate all from index
 *   pnpm tsx scripts/elevenlabs-sfx.ts shotgun-shoot pickup-hp   # subset
 *   pnpm tsx scripts/elevenlabs-sfx.ts --dry-run   # print plan, no API calls
 *
 * Env (loaded .env → .env.local; local wins):
 *   ELEVENLABS_API_KEY    required, https://elevenlabs.io → Profile → API Keys
 *   ELEVENLABS_ENDPOINT   default https://api.elevenlabs.io
 *   ELEVENLABS_SFX_MODEL  default eleven_text_to_sound_v2
 *
 * Output:
 *   .playground/sfx/elevenlabs/<id>.mp3   (skipped if already exists)
 *   Then run scripts/sync-elevenlabs-sfx.sh (or the install step) to copy
 *   the picked wavs into public/assets/audio/sfx/.
 *
 * Free tier: ~50 generations/month, non-commercial only.
 */

import { config as loadEnv } from 'dotenv';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { load as parseYaml } from 'js-yaml';

loadEnv();
loadEnv({ path: '.env.local', override: true });

const API_KEY = process.env.ELEVENLABS_API_KEY;
const ENDPOINT = process.env.ELEVENLABS_ENDPOINT ?? 'https://api.elevenlabs.io';
const MODEL = process.env.ELEVENLABS_SFX_MODEL ?? 'eleven_text_to_sound_v2';
const OUT_DIR = resolve('.playground/sfx/elevenlabs');
const INDEX_PATH = 'public/data/audios/index.yaml';
const SFX_DIR = 'public/data/audios/sfx';
const DRY_RUN = process.argv.includes('--dry-run');

if (!API_KEY && !DRY_RUN) {
    console.error('❌ ELEVENLABS_API_KEY is empty — set it in .env.local');
    process.exit(1);
}

// ─── YAML helpers ──────────────────────────────────────────────────────────
interface SfxIndex {
    sfx: string[];
    music?: string[];
}
interface SfxYaml {
    kind: 'sfx';
    id: string;
    name: string;
    source: string;
    volume?: number;
    rate?: number;
    loop?: boolean;
    prompt?: string;
}

function readSfxIndex(): SfxIndex {
    return parseYaml(readFileSync(INDEX_PATH, 'utf-8')) as SfxIndex;
}
function readSfxSpec(id: string): SfxYaml | null {
    const path = join(SFX_DIR, `${id}.yaml`);
    if (!existsSync(path)) return null;
    return parseYaml(readFileSync(path, 'utf-8')) as SfxYaml;
}

// ─── HTTP ──────────────────────────────────────────────────────────────────
async function generateSound(text: string, durationSeconds: number): Promise<ArrayBuffer> {
    const url = `${ENDPOINT}/v1/sound-generation?output_format=mp3_44100_128`;
    const body = {
        text,
        duration_seconds: durationSeconds,
        prompt_influence: 0.3,
        model_id: MODEL,
    };
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'xi-api-key': API_KEY!,
            'Content-Type': 'application/json',
            Accept: 'audio/mpeg',
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`ElevenLabs ${res.status}: ${errBody.slice(0, 300)}`);
    }
    return res.arrayBuffer();
}

// ─── Defaults per id ───────────────────────────────────────────────────────
// When the YAML has no `prompt:` we fall back to a default duration so the
// script still knows how long to request. (We never invent a prompt — that
// lives in the YAML.)
const DEFAULT_DURATION: Record<string, number> = {
    'pickup-': 1.0,
    '-shoot': 1.2,
    '-death': 1.5,
    '-aggro': 0.5,
    '-hurt': 1.0,
    'heartbeat': 1.0,
    'dodge': 0.8,
    'footstep': 0.5,
    'dry-fire': 0.5,
    'bullet-wall': 0.7,
    'reload-': 0.9,
};
function defaultDuration(id: string): number {
    for (const [prefix, dur] of Object.entries(DEFAULT_DURATION)) {
        if (id.startsWith(prefix) || id.endsWith(prefix.replace(/^-/, ''))) return dur;
    }
    return 1.0;
}

// ─── CLI: subset filter ────────────────────────────────────────────────────
const argv = process.argv.slice(2);
if (argv.includes('--help') || argv.includes('-h')) {
    console.log(
        `Usage: pnpm tsx scripts/elevenlabs-sfx.ts [id...]\n` +
            `       (no args = generate all from index.yaml)\n` +
            `       --dry-run                print plan, do not call API`,
    );
    process.exit(0);
}
const requestedIds = argv.filter((a) => !a.startsWith('--'));
const subsetFilter = requestedIds.length > 0 ? new Set(requestedIds) : null;

// ─── Main ──────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
    const index = readSfxIndex();
    const allSfxIds = index.sfx ?? [];
    const targets = subsetFilter
        ? allSfxIds.filter((id) => subsetFilter.has(id))
        : allSfxIds;

    // Resolve specs + skip those without a prompt.
    interface Job {
        id: string;
        prompt: string;
        duration: number;
    }
    const jobs: Job[] = [];
    const skippedNoPrompt: string[] = [];
    const skippedMissing: string[] = [];
    for (const id of targets) {
        const spec = readSfxSpec(id);
        if (!spec) {
            skippedMissing.push(id);
            continue;
        }
        if (!spec.prompt) {
            skippedNoPrompt.push(id);
            continue;
        }
        jobs.push({ id, prompt: spec.prompt, duration: defaultDuration(id) });
    }

    console.log(
        `🎵 ElevenLabs SFX batch — model=${MODEL}, ${jobs.length} clip(s)` +
            (DRY_RUN ? ' [DRY RUN]' : ''),
    );
    if (skippedMissing.length) console.log(`  ⚠ yaml missing for: ${skippedMissing.join(', ')}`);
    if (skippedNoPrompt.length)
        console.log(`  ⏭  no prompt in yaml for: ${skippedNoPrompt.join(', ')} (skipping)`);
    console.log(`📁 Output: ${OUT_DIR}\n`);

    if (DRY_RUN) {
        jobs.forEach((j) => console.log(`  - ${j.id} (${j.duration}s): ${j.prompt.slice(0, 60)}…`));
        process.exit(0);
    }

    mkdirSync(OUT_DIR, { recursive: true });

    let ok = 0,
        skipped = 0,
        failed = 0;
    for (const job of jobs) {
        const outPath = resolve(OUT_DIR, `${job.id}.mp3`);
        if (existsSync(outPath)) {
            console.log(`⏭  ${job.id} — already exists, skipping`);
            skipped++;
            continue;
        }
        process.stdout.write(`▶ ${job.id} (${job.duration}s)… `);
        try {
            const audio = await generateSound(job.prompt, job.duration);
            writeFileSync(outPath, new Uint8Array(audio));
            console.log(`✓ ${(audio.byteLength / 1024).toFixed(1)}KB`);
            ok++;
        } catch (err) {
            console.log(`✗ ${(err as Error).message}`);
            failed++;
        }
    }

    console.log(`\nDone: ${ok} generated, ${skipped} skipped, ${failed} failed`);
    if (failed > 0) process.exit(1);
}

main().catch((err) => {
    console.error('💥', err);
    process.exit(1);
});