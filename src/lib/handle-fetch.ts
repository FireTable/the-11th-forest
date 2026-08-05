/**
 * src/lib/handle-fetch.ts
 * --------------------------------------------------------------------------
 * Drop-in replacement for global `fetch` that handles the Node ↔ browser
 * path mismatch for `/data/*` URLs and provides automatic in-memory caching
 * for static `/data/*` GET requests across all data loaders.
 *
 * Browser: behaves like global `fetch` with in-memory caching for `/data/*`.
 * Node 22+: translates `/data/levels/X.yaml` → `file://.../public/data/levels/X.yaml`
 *
 * `node:fs` and `node:path` are dynamic-imported so they never enter the
 * browser bundle. Side effects are confined to the Node branch and run
 * once (lazy + idempotent).
 */

let setupPromise: Promise<void> | null = null;
const responseCache = new Map<string, Promise<Response>>();

/**
 * Clear the in-memory fetch cache.
 * Useful when the editor modifies local YAML files and needs fresh data.
 */
export function clearFetchCache(url?: string): void {
    if (url) {
        responseCache.delete(url);
    } else {
        responseCache.clear();
    }
}

async function ensureNodeOverride(): Promise<void> {
    if (typeof window !== 'undefined') return; // browser: nothing to do
    if (setupPromise) return setupPromise;
    setupPromise = (async () => {
        const { resolve } = await import('node:path');
        const { readFileSync } = await import('node:fs');
        const original = globalThis.fetch;
        globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
            const url =
                typeof input === 'string'
                    ? input
                    : input instanceof URL
                      ? input.href
                      : (input as Request).url;
            if (typeof url === 'string' && url.startsWith('/data/')) {
                const text = readFileSync(resolve('public' + url), 'utf8');
                return Promise.resolve(new Response(text));
            }
            return original(input, init);
        };
    })();
    return setupPromise;
}

/**
 * Identical signature to global `fetch`. Use this everywhere `/data/*`
 * paths appear so Node scripts and browser code stay in sync.
 *
 * Automatically caches GET responses for `/data/*` URLs so repeat reads
 * return cloned responses without network overhead.
 */
export async function fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    await ensureNodeOverride();

    const url =
        typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.href
              : (input as Request).url;
    const method = init?.method?.toUpperCase() ?? 'GET';
    const isCacheable = method === 'GET' && typeof url === 'string' && url.startsWith('/data/');

    if (isCacheable && responseCache.has(url)) {
        const cached = await responseCache.get(url)!;
        return cached.clone();
    }

    const fetchPromise = (async () => {
        const res = await globalThis.fetch(input, init);
        if (!res.ok) {
            responseCache.delete(url);
        }
        return res;
    })();

    if (isCacheable) {
        responseCache.set(url, fetchPromise);
    }

    const res = await fetchPromise;
    return res.clone();
}
