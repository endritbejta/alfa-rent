import { describe, expect, it, vi, beforeEach } from "vitest";

const queryRaw = vi.fn();
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $queryRaw: (...args: unknown[]) => queryRaw(...args),
    rateLimit: { deleteMany: vi.fn() },
  },
}));

const { consumeRateLimit, clientIp, normalizeIp } =
  await import("./rate-limit");

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

  it("keys an IPv6 client by its /64, so rotating its own addresses buys nothing", () => {
    const a = clientIp(
      new Headers({ "x-forwarded-for": "2001:db8:1:2:aaaa::1, 70.41.3.18" })
    );
    const b = clientIp(
      new Headers({ "x-forwarded-for": "2001:db8:1:2:ffff:ffff:ffff:fffe" })
    );
    expect(a).toBe("2001:db8:1:2::/64");
    expect(b).toBe(a);
  });

  it("uses x-real-ip when there is no x-forwarded-for, normalised the same way", () => {
    expect(clientIp(new Headers({ "x-real-ip": "2001:DB8::7" }))).toBe(
      "2001:db8:0:0::/64"
    );
  });

  it("puts a garbage header in the shared unknown bucket, not a bucket of its own", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "not-an-ip" }))).toBe(
      "unknown"
    );
  });
});

describe("normalizeIp", () => {
  it.each([
    ["203.0.113.9", "203.0.113.9"],
    ["0.0.0.0", "0.0.0.0"],
    ["255.255.255.255", "255.255.255.255"],
    ["203.0.113.9:8443", "203.0.113.9"],
  ])("keeps IPv4 %s whole", (input, expected) => {
    expect(normalizeIp(input)).toBe(expected);
  });

  it.each([
    // Full form, leading zeros and upper case.
    ["2001:0DB8:0001:0002:0003:0004:0005:0006", "2001:db8:1:2::/64"],
    // Compressed in the interface half, the network half, and both.
    ["2001:db8:1:2::1", "2001:db8:1:2::/64"],
    ["2001:db8::2:3:4:5:6", "2001:db8:0:2::/64"],
    ["2001:db8::", "2001:db8:0:0::/64"],
    ["::1", "0:0:0:0::/64"],
    ["::", "0:0:0:0::/64"],
    // Bracketed with a port, and with a zone.
    ["[2001:db8:1:2::1]:443", "2001:db8:1:2::/64"],
    ["fe80::1%eth0", "fe80:0:0:0::/64"],
    // An embedded IPv4 tail that is not the mapped prefix stays IPv6.
    ["64:ff9b::192.0.2.1", "64:ff9b:0:0::/64"],
  ])("reduces IPv6 %s to its /64", (input, expected) => {
    expect(normalizeIp(input)).toBe(expected);
  });

  it.each([
    ["::ffff:203.0.113.9", "203.0.113.9"],
    ["::FFFF:203.0.113.9", "203.0.113.9"],
    ["::ffff:cb00:7109", "203.0.113.9"],
    ["0:0:0:0:0:ffff:203.0.113.9", "203.0.113.9"],
  ])("reads IPv4-mapped %s as the IPv4 it carries", (input, expected) => {
    expect(normalizeIp(input)).toBe(expected);
  });

  it.each([
    "",
    "unknown",
    "256.1.1.1",
    "1.2.3",
    "1.2.3.4.5",
    "2001:db8::1::2",
    "2001:db8:1:2:3:4:5:6:7",
    "2001:db8:1:2:3:4:5",
    "2001:db8:1:2:3:4:5:6::",
    "12345::1",
    "2001:db8::g",
    "1.2.3.4::1",
    "::ffff:999.1.1.1",
    "<script>",
  ])("refuses %j", (input) => {
    expect(normalizeIp(input)).toBeNull();
  });
});
