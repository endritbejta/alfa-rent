import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The per-account failed-sign-in counter (audit P2-1b): when it alerts, that
 * it alerts once per window, and that nothing it does can fail a sign-in.
 * The window itself is the real limiter's, covered in rate-limit tests; here
 * it stands in as a counter the test controls.
 */
const { consumeRateLimit, resetRateLimit, sendEmail, recordAudit, db } =
  vi.hoisted(() => ({
    consumeRateLimit: vi.fn(),
    resetRateLimit: vi.fn(),
    sendEmail: vi.fn(),
    recordAudit: vi.fn(),
    db: {
      user: { findUnique: vi.fn(), findMany: vi.fn() },
      $transaction: vi.fn(),
    },
  }));

vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit, resetRateLimit }));
vi.mock("@/lib/email", () => ({ sendEmail }));
vi.mock("@/lib/audit", () => ({ recordAudit }));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
// No request scope in a test: run the deferred work at once, as after() would
// once the response has gone.
vi.mock("next/server", () => ({ after: (task: () => unknown) => task() }));

const {
  ACCOUNT_FAILURE_THRESHOLD,
  accountFailureKey,
  alertRepeatedFailures,
  buildFailedSignInEmail,
  clearFailedSignIns,
  crossesThreshold,
  noteFailedSignIn,
} = await import("./sign-in-alert.service");

const window = (count: number) => ({
  allowed: count <= ACCOUNT_FAILURE_THRESHOLD,
  remaining: 0,
  count,
  retryAfter: 60,
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  vi.clearAllMocks();
  db.user.findUnique.mockResolvedValue({
    id: "user-1",
    name: "Arta",
    email: "arta@alfa.test",
  });
  db.user.findMany.mockResolvedValue([{ email: "owner@alfa.test" }]);
  db.$transaction.mockImplementation((run: (tx: unknown) => unknown) =>
    run("tx")
  );
  sendEmail.mockResolvedValue("sent");
});

describe("accountFailureKey", () => {
  it("is one key per account however the address is typed", () => {
    expect(accountFailureKey(" Arta@Alfa.test ")).toBe(
      accountFailureKey("arta@alfa.test")
    );
  });

  it("never holds the address in the clear", () => {
    const key = accountFailureKey("arta@alfa.test");
    expect(key).toMatch(/^login-account:[0-9a-f]{64}$/);
    expect(key).not.toContain("arta");
  });
});

describe("crossesThreshold", () => {
  it("is true for exactly one count per window", () => {
    const counts = Array.from({ length: 20 }, (_, i) => i + 1);
    expect(counts.filter(crossesThreshold)).toEqual([
      ACCOUNT_FAILURE_THRESHOLD,
    ]);
  });
});

describe("noteFailedSignIn", () => {
  it("does nothing below the threshold", async () => {
    consumeRateLimit.mockResolvedValue(window(ACCOUNT_FAILURE_THRESHOLD - 1));
    await noteFailedSignIn("arta@alfa.test", "203.0.113.9");
    await flush();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("alerts once when the threshold is crossed, and not again for the rest of the window", async () => {
    for (let count = 1; count <= ACCOUNT_FAILURE_THRESHOLD + 10; count++) {
      consumeRateLimit.mockResolvedValueOnce(window(count));
      await noteFailedSignIn("arta@alfa.test", "203.0.113.9");
    }
    await flush();
    expect(sendEmail).toHaveBeenCalledOnce();
    expect(recordAudit).toHaveBeenCalledOnce();
    expect(consumeRateLimit).toHaveBeenCalledWith(
      accountFailureKey("arta@alfa.test"),
      ACCOUNT_FAILURE_THRESHOLD,
      3600
    );
  });

  it("alerts again in a new window", async () => {
    consumeRateLimit.mockResolvedValue(window(ACCOUNT_FAILURE_THRESHOLD));
    await noteFailedSignIn("arta@alfa.test", "203.0.113.9");
    await noteFailedSignIn("arta@alfa.test", "203.0.113.9");
    await flush();
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });

  it("never throws into the sign-in, whatever fails underneath", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    consumeRateLimit.mockRejectedValueOnce(new Error("db down"));
    await expect(
      noteFailedSignIn("arta@alfa.test", "203.0.113.9")
    ).resolves.toBeUndefined();

    consumeRateLimit.mockResolvedValueOnce(window(ACCOUNT_FAILURE_THRESHOLD));
    db.user.findUnique.mockRejectedValueOnce(new Error("db down"));
    await expect(
      noteFailedSignIn("arta@alfa.test", "203.0.113.9")
    ).resolves.toBeUndefined();
    await flush();
    logged.mockRestore();
  });
});

describe("clearFailedSignIns", () => {
  it("clears the account's window on success", async () => {
    await clearFailedSignIns("Arta@alfa.test");
    expect(resetRateLimit).toHaveBeenCalledWith(
      accountFailureKey("arta@alfa.test")
    );
  });
});

describe("alertRepeatedFailures", () => {
  it("mails the active admins and records a system event without the IP", async () => {
    const result = await alertRepeatedFailures(
      "arta@alfa.test",
      "2001:db8::/64"
    );
    expect(result).toBe("sent");
    expect(db.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { role: "ADMIN", active: true } })
    );
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: ["owner@alfa.test"] })
    );
    expect(recordAudit).toHaveBeenCalledWith("tx", {
      actorId: null,
      action: "staff.failedSignIns",
      entityId: "user-1",
      after: {
        failures: ACCOUNT_FAILURE_THRESHOLD,
        windowMinutes: 60,
        alertEmail: "sent",
      },
    });
  });

  it("still records the event when Resend is not configured", async () => {
    sendEmail.mockResolvedValue("skipped");
    expect(await alertRepeatedFailures("arta@alfa.test", "203.0.113.9")).toBe(
      "skipped"
    );
    expect(recordAudit).toHaveBeenCalledWith(
      "tx",
      expect.objectContaining({
        after: expect.objectContaining({ alertEmail: "skipped" }),
      })
    );
  });

  it("stays silent for an address that is not an account", async () => {
    db.user.findUnique.mockResolvedValue(null);
    expect(await alertRepeatedFailures("nobody@alfa.test", "203.0.113.9")).toBe(
      "no-account"
    );
    expect(sendEmail).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });
});

describe("buildFailedSignInEmail", () => {
  it("says who, how many, from where, and that nothing was locked, escaped", () => {
    const email = buildFailedSignInEmail({
      accountEmail: "arta@alfa.test",
      accountName: "Arta <b>",
      failures: 5,
      windowMinutes: 60,
      ip: "203.0.113.9",
      at: new Date("2026-11-14T09:00:00.000Z"),
    });
    expect(email.subject).toContain("Arta <b>");
    expect(email.text).toContain("arta@alfa.test");
    expect(email.text).toContain("5");
    expect(email.text).toContain("203.0.113.9");
    expect(email.text).toContain("2026-11-14T09:00:00.000Z");
    expect(email.html).not.toContain("<b>");
    expect(email.html).toContain("&lt;b&gt;");
  });
});
