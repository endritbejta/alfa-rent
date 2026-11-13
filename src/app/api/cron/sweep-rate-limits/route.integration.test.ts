import { randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { prisma } from "@/lib/db/prisma";
import { GET } from "./route";

/*
 * The daily rate_limits sweep (audit P3-7), through the route handler with
 * the real database: only windows expired for more than a day go, and only
 * Vercel Cron's bearer secret may trigger it.
 */
const suffix = randomUUID().slice(0, 8);
const SECRET = `cron-${suffix}`;
const key = (name: string) => `sweep-test:${name}:${suffix}`;
const HOUR = 60 * 60 * 1000;

const call = (secret: string | null = SECRET) =>
  GET(
    new Request("http://localhost/api/cron/sweep-rate-limits", {
      headers: secret ? { authorization: `Bearer ${secret}` } : {},
    })
  );

const remaining = async () =>
  (
    await prisma.rateLimit.findMany({
      where: { key: { endsWith: suffix } },
      select: { key: true },
      orderBy: { key: "asc" },
    })
  ).map((row) => row.key);

beforeEach(async () => {
  vi.stubEnv("CRON_SECRET", SECRET);
  const now = Date.now();
  await prisma.rateLimit.createMany({
    data: [
      { key: key("live"), count: 1, expiresAt: new Date(now + HOUR) },
      { key: key("just-expired"), count: 1, expiresAt: new Date(now - HOUR) },
      { key: key("stale"), count: 9, expiresAt: new Date(now - 25 * HOUR) },
      { key: key("ancient"), count: 3, expiresAt: new Date(now - 900 * HOUR) },
    ],
  });
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await prisma.rateLimit.deleteMany({ where: { key: { endsWith: suffix } } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("GET /api/cron/sweep-rate-limits", () => {
  it("deletes windows expired over a day ago and keeps the rest", async () => {
    const response = await call();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    // Other suites' leftovers may go too, so at least our two.
    expect(body.data.deleted).toBeGreaterThanOrEqual(2);
    expect(await remaining()).toEqual([key("just-expired"), key("live")]);
  });

  it.each([
    ["no header", null],
    ["a wrong secret", "not-the-secret"],
  ])("refuses %s and deletes nothing", async (_, secret) => {
    expect((await call(secret)).status).toBe(401);
    expect(await remaining()).toHaveLength(4);
  });

  it("refuses everyone when CRON_SECRET is unset", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("")).status).toBe(401);
    expect((await call(SECRET)).status).toBe(401);
    expect(await remaining()).toHaveLength(4);
  });
});
