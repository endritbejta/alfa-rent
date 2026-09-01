import { prisma } from "@/lib/db/prisma";

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  /** Seconds until the window resets — surfaced as Retry-After. */
  retryAfter: number;
};

/**
 * Fixed-window rate limiting backed by Postgres.
 *
 * Postgres rather than a cache because it is already shared by every
 * serverless instance, and an in-memory counter would reset on cold start
 * and count separately per instance — worse than useless, since it would
 * look like protection while providing none. A dedicated cache would cost
 * less per check; at this traffic one indexed upsert is not the bottleneck.
 *
 * The count is incremented in a single statement: reading then writing
 * would let two simultaneous attempts both observe the old value and both
 * pass, which is exactly the case a limiter exists to stop.
 */
export async function consumeRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  // Never fail closed on a limiter fault — losing the counter must not take
  // the booking form down with it.
  const open: RateLimitResult = {
    allowed: true,
    remaining: limit,
    retryAfter: 0,
  };

  let rows: { count: number; expiresAt: Date }[];
  try {
    rows = await prisma.$queryRaw<{ count: number; expiresAt: Date }[]>`
      INSERT INTO rate_limits ("key", "count", "expiresAt")
      VALUES (${key}, 1, now() + make_interval(secs => ${windowSeconds}))
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN rate_limits."expiresAt" < now() THEN 1
          ELSE rate_limits."count" + 1
        END,
        "expiresAt" = CASE
          WHEN rate_limits."expiresAt" < now()
            THEN now() + make_interval(secs => ${windowSeconds})
          ELSE rate_limits."expiresAt"
        END
      RETURNING "count", "expiresAt"
    `;
  } catch (error) {
    // A thrown query is the same fault as an empty result, and far likelier:
    // every sign-in, booking and upload signature writes this table through a
    // pooler capped at one connection. Failing closed here turns a transient
    // database blip into "invalid credentials" for every staff member at once,
    // because authorize() has no catch of its own.
    console.error("Rate limiter unavailable, allowing request:", error);
    return open;
  }

  const row = rows[0];
  if (!row) return open;

  const retryAfter = Math.max(
    0,
    Math.ceil((row.expiresAt.getTime() - Date.now()) / 1000)
  );

  return {
    allowed: row.count <= limit,
    remaining: Math.max(0, limit - row.count),
    retryAfter,
  };
}

/**
 * Best-effort client identity. Vercel sets x-forwarded-for; the left-most
 * entry is the client, the rest are proxies. A spoofed header only ever
 * splits an attacker's own bucket, never someone else's.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return headers.get("x-real-ip") ?? "unknown";
}

/** Clears a window, e.g. once a sign-in finally succeeds. */
export async function resetRateLimit(key: string): Promise<void> {
  await prisma.rateLimit.deleteMany({ where: { key } });
}
