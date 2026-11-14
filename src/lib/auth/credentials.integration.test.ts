import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

/*
 * The credentials sign-in path: Auth.js's authorize() as configured in
 * src/lib/auth/index.ts, with verifyCredentials and the Postgres-backed
 * limiter underneath, against the real database.
 *
 * The IP-keyed limiter, the generic null for every failure and the dummy
 * bcrypt compare are on the audit's "should NOT be changed" list
 * (docs/audit/ALFA-RENT-ENGINEERING-AUDIT.md). These tests pin them as they
 * are; they change nothing.
 *
 * Only NextAuth() itself stands in, so that the authorize callback it is
 * handed can be called directly. Everything that callback runs is real.
 */
type Authorize = (
  credentials: Record<string, unknown>,
  request: Request
) => Promise<unknown>;

const captured = vi.hoisted(() => ({ authorize: null as Authorize | null }));

vi.mock("next-auth", () => ({
  default: (config: { providers: { authorize: Authorize }[] }) => {
    captured.authorize = config.providers[0]!.authorize;
    return { handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() };
  },
}));
vi.mock("next-auth/providers/credentials", () => ({
  default: (options: unknown) => options,
}));
// No request scope here: keep what the sign-in schedules for after the
// response, so a test can wait for it.
const deferred = vi.hoisted(() => [] as Promise<unknown>[]);
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => Promise<unknown>) => {
    deferred.push(task());
  },
}));
const settleDeferred = async () => {
  await Promise.all(deferred.splice(0));
};

import { prisma } from "@/lib/db/prisma";
import "@/lib/auth";
import { createStaff } from "@/services/staff.service";
import {
  createTestActor,
  purgeAuditEvents,
  removeTestActor,
} from "@/lib/testing/audit";
import { normalizeIp } from "@/lib/rate-limit";
import {
  ACCOUNT_FAILURE_THRESHOLD,
  accountFailureKey,
} from "@/services/sign-in-alert.service";

// Every staff write records who did it; this stands behind them here.
let actor = "";
beforeAll(async () => {
  actor = await createTestActor("credentials");
});
afterAll(async () => {
  await removeTestActor(actor);
});

const suffix = randomUUID().slice(0, 8);
const email = `signin-${suffix}@example.test`;
const inactiveEmail = `signin-inactive-${suffix}@example.test`;
const password = "correct horse battery staple";
let userId: string;

/**
 * Each test signs in from its own address, so starts with its own bucket: an
 * IPv6 /64 of this run's own, since the limiter keys IPv6 by /64.
 */
const runPrefix = `2001:${suffix.slice(0, 4)}:${suffix.slice(4, 8)}`;
let ip: string;
let ipCounter = 0;
const nextIp = () => `${runPrefix}:${(++ipCounter).toString(16)}::1`;
const limiterKey = () => `login:${normalizeIp(ip)}`;
const runLoginKeys = `login:${normalizeIp(`${runPrefix}::1`)!.split(":").slice(0, 3).join(":")}:`;

function authorize(credentials: { email: string; password: string }) {
  const request = new Request(
    "http://localhost/api/auth/callback/credentials",
    {
      method: "POST",
      headers: { "x-forwarded-for": ip },
    }
  );
  return captured.authorize!(credentials, request);
}

const failuresCounted = async () =>
  (await prisma.rateLimit.findUnique({ where: { key: limiterKey() } }))
    ?.count ?? 0;

const compare = vi.spyOn(bcrypt, "compare");

beforeAll(async () => {
  // Through the real staff path, so the hash is made at the cost real
  // accounts use; the dummy-hash test below compares against it.
  ({ id: userId } = await createStaff(actor, {
    name: "Sign In",
    email,
    role: "EMPLOYEE",
    temporaryPassword: password,
  }));
  await createStaff(actor, {
    name: "Gone Away",
    email: inactiveEmail,
    role: "EMPLOYEE",
    temporaryPassword: password,
  });
  await prisma.user.update({
    where: { email: inactiveEmail },
    data: { active: false },
  });
});

beforeEach(async () => {
  ip = nextIp();
  compare.mockClear();
  // The per-account count spans addresses, so each test starts it afresh.
  await prisma.rateLimit.deleteMany({
    where: {
      key: { in: [accountFailureKey(email), accountFailureKey(inactiveEmail)] },
    },
  });
});

afterAll(async () => {
  compare.mockRestore();
  await settleDeferred();
  await purgeAuditEvents({ entityIds: [userId] });
  await prisma.rateLimit.deleteMany({
    where: {
      key: {
        in: [
          accountFailureKey(email),
          accountFailureKey(inactiveEmail),
          accountFailureKey(`nobody-${suffix}@example.test`),
        ],
      },
    },
  });
  await prisma.user.deleteMany({
    where: { email: { in: [email, inactiveEmail] } },
  });
  await prisma.rateLimit.deleteMany({
    where: { key: { startsWith: runLoginKeys } },
  });
  await prisma.$disconnect();
});

describe("credential verification", () => {
  it("signs in an active user and hands Auth.js only the token's claims", async () => {
    const user = await authorize({ email, password });
    // The exact set: never the password hash, never mustChangePassword or
    // active, which the guards read fresh from the row instead.
    expect(user).toEqual({
      id: userId,
      name: "Sign In",
      email,
      role: "EMPLOYEE",
      sessionVersion: 0,
    });
  });

  it("refuses a wrong password", async () => {
    expect(await authorize({ email, password: "not the password" })).toBeNull();
  });

  it("refuses a deactivated user even with the right password", async () => {
    expect(await authorize({ email: inactiveEmail, password })).toBeNull();
    // And it paid for the comparison, like any other refusal, so being
    // deactivated is not distinguishable by how fast the answer came.
    expect(compare).toHaveBeenCalledTimes(1);
  });

  it("matches the email whatever case it is typed in", async () => {
    const shouted = email.toUpperCase();
    expect(shouted).not.toBe(email);
    await expect(
      authorize({ email: shouted, password })
    ).resolves.toMatchObject({ id: userId });
    const mixed = email.replace(/^s/, "S").replace("example", "Example");
    await expect(authorize({ email: mixed, password })).resolves.toMatchObject({
      id: userId,
    });
  });

  it("still runs bcrypt, at the real accounts' cost, for an email nobody has", async () => {
    const result = await authorize({
      email: `nobody-${suffix}@example.test`,
      password,
    });
    expect(result).toBeNull();

    // Asserted on what was computed, not on timing: one compare, of the
    // typed password, against a well-formed bcrypt hash that is not any
    // user's, at the same work factor a real account's hash has. A cheaper
    // dummy (or none) would answer an unknown email measurably faster.
    expect(compare).toHaveBeenCalledTimes(1);
    const [typed, dummy] = compare.mock.calls[0]!;
    expect(typed).toBe(password);
    expect(dummy).toMatch(/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/);

    const { password: realHash } = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { password: true },
    });
    expect(dummy).not.toBe(realHash);
    expect(bcrypt.getRounds(dummy as string)).toBe(bcrypt.getRounds(realHash));
  });
});

describe("the IP-keyed login limiter", () => {
  it("counts failures and clears them on a success", async () => {
    for (let i = 0; i < 3; i++) {
      expect(await authorize({ email, password: `wrong-${i}` })).toBeNull();
    }
    expect(await failuresCounted()).toBe(3);

    await expect(authorize({ email, password })).resolves.toMatchObject({
      id: userId,
    });
    // Reset, not merely decremented: someone who fumbled their password and
    // then got it right is never carried towards the limit.
    expect(
      await prisma.rateLimit.findUnique({ where: { key: limiterKey() } })
    ).toBeNull();

    expect(await authorize({ email, password: "wrong-again" })).toBeNull();
    expect(await failuresCounted()).toBe(1);
  });

  it("refuses even the right password once ten have failed, without checking it", async () => {
    for (let i = 0; i < 10; i++) {
      await authorize({ email, password: `wrong-${i}` });
    }
    compare.mockClear();

    expect(await authorize({ email, password })).toBeNull();
    // The limit is checked before the password: a blocked address gets no
    // oracle at all, and costs the server no bcrypt work.
    expect(compare).not.toHaveBeenCalled();
  });

  it("blocks the address, not the account", async () => {
    // An email-keyed limiter would let anyone lock a real employee out by
    // guessing at their address. Ten failures from one address leave the
    // same account free to sign in from another.
    for (let i = 0; i < 10; i++) {
      await authorize({ email, password: `wrong-${i}` });
    }
    expect(await authorize({ email, password })).toBeNull();

    ip = nextIp();
    await expect(authorize({ email, password })).resolves.toMatchObject({
      id: userId,
    });
  });
});

/**
 * Audit P2-1b. Guesses spread across many addresses each stay under the IP
 * limit, so the account is counted too, and the owner is told. It alerts; it
 * never locks, and the answer is the same null as any other failure.
 */
describe("the per-account failure alert", () => {
  const failedSignInEvents = () =>
    prisma.auditEvent.findMany({
      where: { action: "staff.failedSignIns", entityId: userId },
    });

  it("records one event when an account crosses the threshold from many addresses, and never locks it", async () => {
    await purgeAuditEvents({ entityIds: [userId] });
    for (let i = 0; i < ACCOUNT_FAILURE_THRESHOLD + 3; i++) {
      ip = nextIp();
      expect(await authorize({ email, password: `wrong-${i}` })).toBeNull();
    }
    await settleDeferred();

    const events = await failedSignInEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      system: true,
      actorId: null,
      entity: "staff",
      after: {
        failures: ACCOUNT_FAILURE_THRESHOLD,
        windowMinutes: 60,
        // No Resend key in tests: the alert is skipped, the event kept.
        alertEmail: "skipped",
      },
    });
    // Nothing that was typed, and no address, is kept in the trail.
    expect(JSON.stringify(events[0])).not.toContain("wrong-");
    expect(JSON.stringify(events[0])).not.toContain(runPrefix);

    // Still free to sign in, and the success clears the account's count.
    ip = nextIp();
    await expect(authorize({ email, password })).resolves.toMatchObject({
      id: userId,
    });
    expect(
      await prisma.rateLimit.findUnique({
        where: { key: accountFailureKey(email) },
      })
    ).toBeNull();
  });

  it("counts an address nobody has without recording anything about it", async () => {
    const nobody = `nobody-${suffix}@example.test`;
    const before = await prisma.auditEvent.count({
      where: { action: "staff.failedSignIns" },
    });
    for (let i = 0; i < ACCOUNT_FAILURE_THRESHOLD; i++) {
      ip = nextIp();
      expect(await authorize({ email: nobody, password })).toBeNull();
    }
    await settleDeferred();
    expect(
      await prisma.auditEvent.count({
        where: { action: "staff.failedSignIns" },
      })
    ).toBe(before);
  });
});
