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

import { prisma } from "@/lib/db/prisma";
import "@/lib/auth";
import { createStaff } from "@/services/staff.service";

const suffix = randomUUID().slice(0, 8);
const email = `signin-${suffix}@example.test`;
const inactiveEmail = `signin-inactive-${suffix}@example.test`;
const password = "correct horse battery staple";
let userId: string;

/** Each test signs in from its own address, so starts with its own bucket. */
let ip: string;
let ipCounter = 0;
const limiterKey = () => `login:${ip}`;

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
  ({ id: userId } = await createStaff({
    name: "Sign In",
    email,
    role: "EMPLOYEE",
    temporaryPassword: password,
  }));
  await createStaff({
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

beforeEach(() => {
  ip = `198.51.100.${++ipCounter}-${suffix}`;
  compare.mockClear();
});

afterAll(async () => {
  compare.mockRestore();
  await prisma.user.deleteMany({
    where: { email: { in: [email, inactiveEmail] } },
  });
  await prisma.rateLimit.deleteMany({
    where: { key: { startsWith: "login:198.51.100.", endsWith: suffix } },
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

    ip = `198.51.100.${++ipCounter}-${suffix}`;
    await expect(authorize({ email, password })).resolves.toMatchObject({
      id: userId,
    });
  });
});
