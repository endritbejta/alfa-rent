import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it, vi } from "vitest";

/*
 * The limiter against a real database in two session time zones (audit
 * finding P3-3).
 *
 * rate_limits."expiresAt" is `timestamp without time zone`. Prisma writes
 * and reads it as UTC; the limiter's raw SQL used bare now(), which is
 * converted through the session's TimeZone. Supabase sessions run in UTC,
 * so production never noticed; the local Homebrew Postgres runs in
 * Europe/Belgrade, where Retry-After came out an hour or two long and a row
 * written through Prisma read as already expired. The same assertions must
 * hold in both.
 *
 * One connection per client, so the SET TIME ZONE below holds for every
 * query the limiter makes.
 */
const zones = ["UTC", "Europe/Belgrade"] as const;

function clientIn(zone: string) {
  const url = new URL(process.env.DATABASE_URL!);
  url.searchParams.set("connection_limit", "1");
  const client = new PrismaClient({ datasourceUrl: url.toString() });
  return {
    client,
    ready: client.$executeRawUnsafe(`SET TIME ZONE '${zone}'`),
  };
}

const clients = Object.fromEntries(
  zones.map((zone) => [zone, clientIn(zone)])
) as Record<(typeof zones)[number], ReturnType<typeof clientIn>>;

let current: PrismaClient;
vi.mock("@/lib/db/prisma", () => ({
  get prisma() {
    return current;
  },
}));
vi.mock("@/lib/observability", () => ({ reportError: vi.fn() }));

const { consumeRateLimit } = await import("@/lib/rate-limit");

const suffix = randomUUID().slice(0, 8);
const keys: string[] = [];

afterAll(async () => {
  for (const { client } of Object.values(clients)) {
    await client.rateLimit.deleteMany({ where: { key: { in: keys } } });
    await client.$disconnect();
  }
});

describe.each(zones)("consumeRateLimit with the session in %s", (zone) => {
  const key = (name: string) => {
    const k = `tz-test:${zone}:${name}:${suffix}`;
    keys.push(k);
    return k;
  };
  const use = async () => {
    await clients[zone].ready;
    current = clients[zone].client;
    return current;
  };

  it("reports the window's real remaining time as Retry-After", async () => {
    await use();
    const k = key("fresh");
    const first = await consumeRateLimit(k, 1, 600);
    const second = await consumeRateLimit(k, 1, 600);
    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(false);
    expect(second.retryAfter).toBeGreaterThan(590);
    expect(second.retryAfter).toBeLessThanOrEqual(600);
  });

  it("stores the expiry in UTC, as Prisma reads it", async () => {
    const db = await use();
    const k = key("stored");
    const before = Date.now();
    await consumeRateLimit(k, 5, 600);
    const row = await db.rateLimit.findUniqueOrThrow({ where: { key: k } });
    const expected = before + 600_000;
    expect(Math.abs(row.expiresAt.getTime() - expected)).toBeLessThan(5_000);
  });

  it("honours a live window written through Prisma", async () => {
    const db = await use();
    const k = key("prisma-written");
    await db.rateLimit.create({
      data: { key: k, count: 3, expiresAt: new Date(Date.now() + 30 * 60_000) },
    });
    const result = await consumeRateLimit(k, 3, 3600);
    // The fourth attempt in a window that still has half an hour to run:
    // refused, not treated as expired and reset to 1.
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeGreaterThan(29 * 60);
    expect(result.retryAfter).toBeLessThanOrEqual(30 * 60);
  });

  it("starts a new window once the old one has expired", async () => {
    const db = await use();
    const k = key("expired");
    await db.rateLimit.create({
      data: { key: k, count: 99, expiresAt: new Date(Date.now() - 60_000) },
    });
    const result = await consumeRateLimit(k, 3, 600);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
  });
});
