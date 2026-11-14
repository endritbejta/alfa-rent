import { prisma } from "@/lib/db/prisma";
import { reportError } from "@/lib/observability";

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  /**
   * Requests counted in this window, this one included; 0 when the limiter
   * failed open. Exactly one request per window sees any given value, which
   * is what lets a caller act once when a threshold is crossed.
   */
  count: number;
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
    count: 0,
    retryAfter: 0,
  };

  let rows: { count: number; expiresAt: Date }[];
  try {
    /*
     * "expiresAt" is `timestamp without time zone` holding UTC, which is how
     * Prisma writes and reads every DateTime. Bare now() is a timestamptz,
     * and comparing or storing it against that column goes through the
     * session's TimeZone: harmless on Supabase (UTC), but an hour or two off
     * on a Europe/Belgrade database — Retry-After came out too long, and a
     * row written through Prisma read as already expired. Pinning the clock
     * to UTC makes the limiter independent of the session (audit P3-3).
     */
    rows = await prisma.$queryRaw<{ count: number; expiresAt: Date }[]>`
      INSERT INTO rate_limits ("key", "count", "expiresAt")
      VALUES (${key}, 1,
              (now() AT TIME ZONE 'UTC') + make_interval(secs => ${windowSeconds}))
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN rate_limits."expiresAt" < (now() AT TIME ZONE 'UTC') THEN 1
          ELSE rate_limits."count" + 1
        END,
        "expiresAt" = CASE
          WHEN rate_limits."expiresAt" < (now() AT TIME ZONE 'UTC')
            THEN (now() AT TIME ZONE 'UTC') + make_interval(secs => ${windowSeconds})
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
    reportError(error, { scope: "rate-limit", key });
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
    count: row.count,
    retryAfter,
  };
}

/**
 * The client a request is counted against: the left-most x-forwarded-for
 * entry, reduced to the block one subscriber controls.
 *
 * The header is trustworthy only because Vercel sets it. Vercel's edge
 * overwrites whatever x-forwarded-for a client sent with the address it saw
 * the connection come from, so the left-most entry is the real peer and
 * cannot be chosen by the caller. That holds for exactly one hop: put another
 * proxy in front (Cloudflare, a load balancer) and the left-most entry
 * becomes whatever the client typed, so every request can pick a fresh
 * bucket. Adding a proxy means reading that proxy's own header instead
 * (Cloudflare's cf-connecting-ip) and refusing traffic that bypassed it.
 *
 * IPv6 is keyed by its /64 (audit P2-1b). An ISP hands one subscriber a /64
 * or larger, and every host picks its own interface identifier, so keying the
 * full address gave a single machine 2^64 buckets to rotate through. IPv4 is
 * kept whole, and an IPv4-mapped IPv6 address (::ffff:a.b.c.d, how a
 * dual-stack socket reports an IPv4 peer) is the IPv4 address it carries,
 * so one client is not two buckets depending on the socket that saw it.
 *
 * Anything that parses as neither shares the one "unknown" bucket rather
 * than becoming a key of its own; on Vercel that never happens.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  const raw = forwarded
    ? forwarded.split(",")[0]!.trim()
    : headers.get("x-real-ip")?.trim();
  return (raw && normalizeIp(raw)) ?? "unknown";
}

/** IPv4 as is, IPv6 as its /64, IPv4-mapped IPv6 as IPv4; null if neither. */
export function normalizeIp(address: string): string | null {
  // "[2001:db8::1]:443" or "203.0.113.9:443" from a proxy that keeps the port.
  let value = address.trim();
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(value);
  if (bracketed) value = bracketed[1]!;
  else if (/^[\d.]+:\d+$/.test(value))
    value = value.slice(0, value.indexOf(":"));

  if (isIpv4(value)) return value;

  const hextets = parseIpv6(value);
  if (!hextets) return null;
  const mapped =
    hextets.slice(0, 5).every((h) => h === 0) && hextets[5] === 0xffff;
  if (mapped) {
    return [
      hextets[6]! >> 8,
      hextets[6]! & 0xff,
      hextets[7]! >> 8,
      hextets[7]! & 0xff,
    ].join(".");
  }
  return `${hextets
    .slice(0, 4)
    .map((h) => h.toString(16))
    .join(":")}::/64`;
}

function isIpv4(value: string): boolean {
  const parts = value.split(".");
  return (
    parts.length === 4 &&
    parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255)
  );
}

/** The eight 16-bit groups of an IPv6 address, or null if it is not one. */
function parseIpv6(input: string): number[] | null {
  // A zone ("fe80::1%eth0") names the local interface, not the host.
  const value = input.split("%")[0]!.toLowerCase();
  if (!value.includes(":")) return null;

  const halves = value.split("::");
  if (halves.length > 2) return null;

  const groups = (part: string, endsAddress: boolean): number[] | null => {
    if (part === "") return [];
    const out: number[] = [];
    const pieces = part.split(":");
    for (let i = 0; i < pieces.length; i++) {
      const piece = pieces[i]!;
      // An embedded IPv4 tail ("::ffff:192.0.2.1") is the last 32 bits.
      if (endsAddress && i === pieces.length - 1 && piece.includes(".")) {
        if (!isIpv4(piece)) return null;
        const [a, b, c, d] = piece.split(".").map(Number) as [
          number,
          number,
          number,
          number,
        ];
        out.push((a << 8) | b, (c << 8) | d);
        continue;
      }
      if (!/^[0-9a-f]{1,4}$/.test(piece)) return null;
      out.push(parseInt(piece, 16));
    }
    return out;
  };

  const head = groups(halves[0]!, halves.length === 1);
  const tail = halves.length === 2 ? groups(halves[1]!, true) : [];
  if (!head || !tail) return null;
  if (halves.length === 1) return head.length === 8 ? head : null;
  const missing = 8 - head.length - tail.length;
  if (missing < 1) return null;
  return [...head, ...Array<number>(missing).fill(0), ...tail];
}

/** Clears a window, e.g. once a sign-in finally succeeds. */
export async function resetRateLimit(key: string): Promise<void> {
  await prisma.rateLimit.deleteMany({ where: { key } });
}

/** How long an expired window is kept before the daily sweep removes it. */
const SWEEP_GRACE_MS = 24 * 60 * 60 * 1000;

/**
 * Deletes windows that expired more than a day ago (audit finding P3-7).
 *
 * Nothing else ever deletes a row: an expired window is only reset when the
 * same key comes back, so every IP that ever booked or failed a sign-in
 * stayed in the table — unbounded growth, and IP addresses kept with no
 * purpose. The day of grace leaves any window still in use untouched
 * whatever the clock skew between Postgres sessions. Run daily by
 * /api/cron/sweep-rate-limits; the expiresAt index serves it.
 */
export async function sweepExpiredRateLimits(
  now = new Date()
): Promise<number> {
  const { count } = await prisma.rateLimit.deleteMany({
    where: { expiresAt: { lt: new Date(now.getTime() - SWEEP_GRACE_MS) } },
  });
  return count;
}
