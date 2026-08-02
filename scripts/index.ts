/**
 * scripts/
 * --------------------------------------------------------------------------
 * Node-side scripts for The 11th Forest. These are NOT bundled into the
 * browser app — run with `tsx scripts/<name>.ts` or wire them into an npm
 * script.
 *
 * Each script lives in its own file under `scripts/` and is re-exported
 * from this barrel so consumers can `import { foo } from './scripts'`.
 *
 * To add a script:
 *   1. Create `scripts/<name>.ts` exporting a `default` function.
 *   2. Re-export it from here.
 *   3. Add an npm script in package.json if it should be runnable via CLI.
 */

export {};
