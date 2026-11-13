/**
 * Stops Zod's `eval` probe in the browser.
 *
 * Zod 4 compiles object parsers with `new Function` when it can. To find out
 * whether it can, the first object parse on a page calls `Function("")`
 * inside a try/catch. The probe is harmless — under an enforced CSP it fails
 * and Zod falls back to its interpreter — but it is an `eval`, so every admin
 * page reported a script-src violation for it, burying the reports worth
 * reading. `jitless` skips the probe and uses the interpreter outright.
 *
 * Why not `z.config({ jitless: true })`: importing Zod from the root layout
 * put about 5 KB gzipped on every storefront page, most of which never parse
 * anything. Zod keeps its config on `globalThis.__zod_globalConfig`, created
 * with `??=`, so writing into that object works whether Zod has loaded yet
 * or not. That name is Zod's internal; zod-jitless.test.ts fails if an
 * upgrade moves it.
 *
 * Browser only: the server is not under the CSP and keeps the faster
 * compiled parsers.
 */
export function setZodJitless(): void {
  const scope = globalThis as { __zod_globalConfig?: { jitless?: boolean } };
  (scope.__zod_globalConfig ??= {}).jitless = true;
}
