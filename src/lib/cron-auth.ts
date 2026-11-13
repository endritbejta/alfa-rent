import { createHash, timingSafeEqual } from "node:crypto";

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/**
 * Whether a request carries Vercel Cron's `Authorization: Bearer
 * $CRON_SECRET`. Without CRON_SECRET it refuses everyone, so an unconfigured
 * deployment's cron routes cannot be triggered by a stranger. Hashing first
 * gives equal lengths, so the comparison is constant-time.
 */
export function isAuthorisedCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  const header = request.headers.get("authorization");
  if (!secret || !header) return false;
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
}
