"use client";

import { setZodJitless } from "@/lib/zod-jitless";

/*
 * Mounted once in the root layout so the setting is in place, in the
 * browser, before any form parses. See src/lib/zod-jitless.ts for why.
 */
if (typeof window !== "undefined") setZodJitless();

export function ZodJitless() {
  return null;
}
