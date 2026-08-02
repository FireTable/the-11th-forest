/**
 * src/lib/handle-fetch.ts
 * --------------------------------------------------------------------------
 * Drop-in replacement for global `fetch` that handles the Node ↔ browser
 * path mismatch for `/data/*` URLs.
 *
 * Browser: behaves like global `fetch` (one if-check on first call, then
 * passes through).
 *
 * Node 22+: translates `/data/levels/X.yaml` → `file://.../public/data/levels/X.yaml`
 * so Node scripts can use the same paths the browser does.
 *
 * `node:fs` and `node:path` are dynamic-imported so they never enter the
 * browser bundle. Side effects are confined to the Node branch and run
 * once (lazy + idempotent).
 */

let setupPromise: Promise<void> | null = null;

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
                // Node's undici fetch doesn't yet support file:// URLs
                // ("not implemented... yet..."). Read with fs and wrap as
                // a Response so the caller can't tell the difference.
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
 */
export async function fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    await ensureNodeOverride();
    return globalThis.fetch(input, init);
}
