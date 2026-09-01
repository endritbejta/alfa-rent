import { describe, expect, it, vi, beforeEach } from "vitest";

const queryRaw = vi.fn();
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $queryRaw: (...args: unknown[]) => queryRaw(...args),
    rateLimit: { deleteMany: vi.fn() },
  },
}));

const { consumeRateLimit, clientIp } = await import("./rate-limit");

const row = (count: number, secondsLeft = 60) => [
  { count, expiresAt: new Date(Date.now() + secondsLeft * 1000) },
];

describe("consumeRateLimit", () => {
  beforeEach(() => queryRaw.mockReset());

  it("allows requests up to the limit", async () => {
    queryRaw.mockResolvedValue(row(8));
    const result = await consumeRateLimit("k", 8, 3600);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it("blocks the request that exceeds the limit", async () => {
    queryRaw.mockResolvedValue(row(9));
    expect((await consumeRateLimit("k", 8, 3600)).allowed).toBe(false);
  });

  it("reports how long until the window resets", async () => {
    queryRaw.mockResolvedValue(row(9, 120));
    const { retryAfter } = await consumeRateLimit("k", 8, 3600);
    expect(retryAfter).toBeGreaterThan(110);
    expect(retryAfter).toBeLessThanOrEqual(120);
  });

  it("fails open — a limiter fault must not take the endpoint down", async () => {
    queryRaw.mockResolvedValue([]);
    expect((await consumeRateLimit("k", 8, 3600)).allowed).toBe(true);
  });

  /**
   * The empty-result case above is the rare fault; a throwing query is the
   * common one. authorize() has no catch, so a limiter that rethrows turns a
   * transient database blip into a failed sign-in for every staff member.
   */
  it("fails open when the query itself throws, not just when it returns nothing", async () => {
    // ...Once, not a persistent implementation: a throwing stub left installed
    // on the shared spy outlives the test body and is invoked again during
    // teardown, which Vitest reports as a failure even though the code under
    // test caught the throw it was given.
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    queryRaw.mockImplementationOnce(() => {
      throw new Error("Timed out fetching a connection");
    });
    const result = await consumeRateLimit("k", 8, 3600);
    logged.mockRestore();
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(8);
    expect(result.retryAfter).toBe(0);
  });
});

describe("clientIp", () => {
  it("takes the client from the left of x-forwarded-for, not the proxy", () => {
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.9, 70.41.3.18, 150.172.238.178",
    });
    expect(clientIp(headers)).toBe("203.0.113.9");
  });

  it("falls back to a constant so an unknown client still shares one bucket", () => {
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
