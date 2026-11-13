import { headers } from "next/headers";

/**
 * This response's CSP nonce, minted by src/proxy.ts.
 *
 * Next stamps it on its own scripts without help. This is for the few
 * elements Next does not render itself: next-themes' pre-paint script, the
 * JSON-LD block and the fleet view's hoisted <style>. Undefined when the
 * proxy did not run (a route its matcher excludes), which renders the
 * element without a nonce exactly as before.
 */
export async function getNonce(): Promise<string | undefined> {
  return (await headers()).get("x-nonce") ?? undefined;
}
