import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";

/*
 * The authorization matrix for every server action.
 *
 * Every export of a "use server" file is a public POST endpoint: hiding a
 * button from an employee, or the whole dashboard from a stranger, decides
 * nothing. What decides is the guard each action calls first. This drives the
 * real actions through the real guards (requireUser / requireRole) with every
 * kind of caller that must be turned away, and proves the refusal happens
 * before anything downstream runs.
 *
 * Only the session (auth()), the user row the guard re-reads, and the layer
 * below the actions stand in: every service, the Cloudinary signer, the rate
 * limiter, the cookie jar, signOut() and cache revalidation are spies, so
 * "reached the service" is a spy call and not a database write.
 *
 * The list of actions is not trusted either. The first test walks src/ for
 * "use server" modules and fails when an exported action is missing from the
 * table below, so a new action cannot ship without someone deciding — here,
 * in review — who may call it.
 */
const { auth, signOut, findUnique } = vi.hoisted(() => ({
  auth: vi.fn(),
  signOut: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth, signOut }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { user: { findUnique } } }));
// Mirrors Next, unstable_rethrow included: a guard that sits inside an
// action's try must still redirect, not become an { error } on screen.
vi.mock("next/navigation", async () =>
  (await import("@/lib/testing/action-mocks")).nextNavigationMock()
);
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
  // The automocked services still evaluate their module bodies, and the
  // storefront reads are wrapped in unstable_cache at the top level.
  unstable_cache: (fn: unknown) => fn,
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ set: vi.fn(), get: vi.fn() })),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/i18n/server", async () =>
  (await import("@/lib/testing/action-mocks")).i18nServerMock()
);

// Everything an action may reach once its guard lets it through.
vi.mock("@/services/customer.service");
vi.mock("@/services/fleet.service");
vi.mock("@/services/image.service");
vi.mock("@/services/inspection.service");
vi.mock("@/services/reservation.service");
vi.mock("@/services/search.service");
vi.mock("@/services/staff.service");
vi.mock("@/services/vehicle.service");
vi.mock("@/lib/cloudinary");
vi.mock("@/lib/rate-limit");
// The mocked services return undefined, which the drawer actions then fail to
// map; that is expected here and only noise in the report.
vi.mock("@/lib/observability");

import { dictionaries } from "@/lib/i18n/translations";
import { consumeRateLimit } from "@/lib/rate-limit";
import { Redirected } from "@/lib/testing/action-mocks";
import { createVehicle } from "@/services/vehicle.service";

const DOWNSTREAM = [
  "@/services/customer.service",
  "@/services/fleet.service",
  "@/services/image.service",
  "@/services/inspection.service",
  "@/services/reservation.service",
  "@/services/search.service",
  "@/services/staff.service",
  "@/services/vehicle.service",
  "@/lib/cloudinary",
  "@/lib/rate-limit",
  "next/headers",
  // Ending a session and busting caches are side effects too: a refused
  // call must not sign anyone out or revalidate anything.
  "next/cache",
] as const;

/** Every spy below the actions, by module and export name. Built once. */
let spies: [string, MockInstance][];

async function collectSpies() {
  const found: [string, MockInstance][] = [["@/lib/auth#signOut", signOut]];
  for (const id of DOWNSTREAM) {
    const mod = (await import(/* @vite-ignore */ id)) as Record<
      string,
      unknown
    >;
    for (const [name, value] of Object.entries(mod)) {
      if (vi.isMockFunction(value)) found.push([`${id}#${name}`, value]);
    }
  }
  return found;
}

function reachedDownstream() {
  return spies
    .filter(([, spy]) => spy.mock.calls.length > 0)
    .map(([name]) => name);
}

// ---------------------------------------------------------------------------
// The table: who may call what.
// ---------------------------------------------------------------------------

/**
 * - ADMIN: requireRole("ADMIN")
 * - EMPLOYEE: requireRole("EMPLOYEE"), which ADMIN also passes
 * - SIGNED_IN: requireUser(), any active staff account
 * - PUBLIC: deliberately unguarded; the reason is written beside it
 */
type Level = "ADMIN" | "EMPLOYEE" | "SIGNED_IN" | "PUBLIC";

type Action = (...args: never[]) => Promise<unknown>;
type Entry = {
  level: Level;
  /** Calls the action with an input it would otherwise accept. */
  call: (action: Action) => Promise<unknown>;
  /** Only for PUBLIC: why this endpoint needs no session. */
  publicBecause?: string;
};

const DAY = 86_400_000;
const inDays = (n: number) => new Date(Date.now() + n * DAY).toISOString();

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
};

const vehicleForm = () =>
  form({
    brand: "BMW",
    model: "320d",
    plate: "ks-01-abc",
    year: "2023",
    category: "SEDAN",
    transmission: "AUTOMATIC",
    fuelType: "DIESEL",
    seats: "5",
    pricePerDay: "60",
    description: "A comfortable executive saloon for longer journeys.",
    status: "AVAILABLE",
    images: "[]",
  });

const strong = "correct horse battery";
// `as never`: each entry passes the arguments its own action takes; the table
// is typed loosely so one shape can hold them all.
const call =
  (...args: unknown[]) =>
  (action: Action) =>
    action(...(args as never[]));

const ACTIONS: Record<string, Entry> = {
  // --- calendar --------------------------------------------------------------
  "(dashboard)/admin/calendar/actions.ts#createManualReservationAction": {
    level: "EMPLOYEE",
    call: call({
      vehicleId: "vehicle-1",
      customer: { kind: "existing", id: "customer-1" },
      pickupDate: inDays(10),
      returnDate: inDays(13),
      status: "PENDING",
    }),
  },
  "(dashboard)/admin/calendar/actions.ts#previewManualReservationAction": {
    level: "EMPLOYEE",
    call: call({
      vehicleId: "vehicle-1",
      pickupDate: inDays(10),
      returnDate: inDays(13),
    }),
  },

  // --- customers -------------------------------------------------------------
  "(dashboard)/admin/customers/actions.ts#updateCustomerAction": {
    level: "EMPLOYEE",
    call: call("customer-1", {
      firstName: "Ana",
      lastName: "Krasniqi",
      email: "ana@example.test",
      phone: "+38344111222",
    }),
  },
  "(dashboard)/admin/customers/actions.ts#mergeCustomersAction": {
    level: "ADMIN",
    call: call({ keepId: "customer-1", mergeIds: ["customer-2"] }),
  },
  "(dashboard)/admin/customers/actions.ts#anonymiseCustomerAction": {
    level: "ADMIN",
    call: call("customer-1"),
  },
  "(dashboard)/admin/customers/actions.ts#searchCustomersAction": {
    level: "SIGNED_IN",
    call: call("krasniqi"),
  },

  // --- drawers ---------------------------------------------------------------
  "(dashboard)/admin/detail-actions.ts#getReservationDetailAction": {
    level: "SIGNED_IN",
    call: call("reservation-1"),
  },
  "(dashboard)/admin/detail-actions.ts#getVehicleDetailAction": {
    level: "SIGNED_IN",
    call: call("vehicle-1"),
  },
  "(dashboard)/admin/detail-actions.ts#getCustomerDetailAction": {
    level: "SIGNED_IN",
    call: call("customer-1"),
  },

  // --- reservations ----------------------------------------------------------
  "(dashboard)/admin/reservations/actions.ts#signInspectionUploadAction": {
    level: "EMPLOYEE",
    call: call("reservation-1", "PICKUP"),
  },
  "(dashboard)/admin/reservations/actions.ts#getPickupMileageAction": {
    level: "EMPLOYEE",
    call: call("reservation-1"),
  },
  "(dashboard)/admin/reservations/actions.ts#recordRentalInspectionAction": {
    level: "EMPLOYEE",
    call: (action) =>
      action(
        ...([
          "reservation-1",
          form({
            type: "PICKUP",
            mileage: "42000",
            fuelLevel: "100",
            signerName: "Ana Krasniqi",
            customerAcknowledged: "on",
            photos: "[]",
          }),
        ] as never[])
      ),
  },
  "(dashboard)/admin/reservations/actions.ts#recordPastRentalAction": {
    level: "EMPLOYEE",
    call: (action) =>
      action(
        ...([
          "reservation-1",
          form({
            startedOn: "2026-10-07",
            returnedOn: "2026-10-15",
            note: "Forgot to start it at the counter.",
            confirmed: "on",
          }),
        ] as never[])
      ),
  },
  "(dashboard)/admin/reservations/actions.ts#updateReservationStatusAction": {
    level: "EMPLOYEE",
    call: call("reservation-1", "CONFIRMED"),
  },
  "(dashboard)/admin/reservations/actions.ts#extendReservationAction": {
    level: "EMPLOYEE",
    call: call("reservation-1", inDays(20)),
  },

  // --- command palette -------------------------------------------------------
  "(dashboard)/admin/search-actions.ts#searchAdminAction": {
    level: "SIGNED_IN",
    call: call("BMW"),
  },

  // --- staff -----------------------------------------------------------------
  "(dashboard)/admin/staff/actions.ts#createStaffAction": {
    level: "ADMIN",
    call: call({
      name: "New Person",
      email: "new@example.test",
      role: "EMPLOYEE",
      temporaryPassword: strong,
    }),
  },
  "(dashboard)/admin/staff/actions.ts#changeStaffRoleAction": {
    level: "ADMIN",
    call: call({ userId: "someone-else", role: "ADMIN" }),
  },
  "(dashboard)/admin/staff/actions.ts#deactivateStaffAction": {
    level: "ADMIN",
    call: call({ userId: "someone-else" }),
  },
  "(dashboard)/admin/staff/actions.ts#reactivateStaffAction": {
    level: "ADMIN",
    call: call({ userId: "someone-else" }),
  },
  "(dashboard)/admin/staff/actions.ts#resetStaffPasswordAction": {
    level: "ADMIN",
    call: call({ userId: "someone-else", temporaryPassword: strong }),
  },
  "(dashboard)/admin/staff/actions.ts#signOutStaffEverywhereAction": {
    level: "ADMIN",
    call: call({ userId: "someone-else" }),
  },

  // --- vehicles --------------------------------------------------------------
  "(dashboard)/admin/vehicles/actions.ts#signVehicleUploadAction": {
    level: "ADMIN",
    call: call({ vehicleId: "vehicle-1" }),
  },
  "(dashboard)/admin/vehicles/actions.ts#createVehicleAction": {
    level: "ADMIN",
    call: (action) => action(...([vehicleForm()] as never[])),
  },
  "(dashboard)/admin/vehicles/actions.ts#updateVehicleAction": {
    level: "ADMIN",
    call: (action) => action(...(["vehicle-1", vehicleForm()] as never[])),
  },
  "(dashboard)/admin/vehicles/actions.ts#deleteVehicleAction": {
    level: "ADMIN",
    call: call("vehicle-1"),
  },
  "(dashboard)/admin/vehicles/actions.ts#addRepairAction": {
    level: "ADMIN",
    call: (action) =>
      action(
        ...([
          "vehicle-1",
          form({
            "repair-date": "2026-10-01",
            "repair-cost": "120.50",
            "repair-description": "Front brake pads",
          }),
        ] as never[])
      ),
  },
  "(dashboard)/admin/vehicles/actions.ts#deleteRepairAction": {
    level: "ADMIN",
    call: call("vehicle-1", "repair-1"),
  },

  // --- account ---------------------------------------------------------------
  "account/password/actions.ts#changeOwnPasswordAction": {
    level: "SIGNED_IN",
    call: call({
      currentPassword: "the old one",
      newPassword: strong,
      confirmPassword: strong,
    }),
  },

  // --- public ----------------------------------------------------------------
  "../lib/i18n/locale-actions.ts#setLocaleAction": {
    level: "PUBLIC",
    publicBecause:
      "the storefront's language switch: it only sets the visitor's own " +
      "locale cookie, validated against the supported list, and reads nothing",
    call: call("en"),
  },
};

/**
 * Inline `"use server"` closures cannot be imported, so they are pinned by
 * file. Both are the sign-out button's action, which ends the caller's own
 * session and needs no guard.
 */
const INLINE_SERVER_ACTIONS = [
  "src/app/(dashboard)/admin/layout.tsx",
  "src/app/account/password/page.tsx",
];

// ---------------------------------------------------------------------------
// Discovery.
// ---------------------------------------------------------------------------

const ROOT = path.resolve(__dirname, "..", "..");
const SRC = path.join(ROOT, "src");
const APP = path.join(SRC, "app");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

/** A file-level directive: the first statement, after comments. */
const FILE_DIRECTIVE =
  /^(?:\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/))*\s*["']use server["']/;

const files = sourceFiles(SRC);
const serverModules = files.filter((f) =>
  FILE_DIRECTIVE.test(readFileSync(f, "utf8"))
);

/** The table's key prefix for a module: its path relative to src/app. */
const keyOf = (file: string) =>
  path.relative(APP, file).split(path.sep).join("/");

async function discoverActions() {
  const found = new Map<string, Action>();
  for (const file of serverModules) {
    const mod = (await import(/* @vite-ignore */ file)) as Record<
      string,
      unknown
    >;
    for (const [name, value] of Object.entries(mod)) {
      if (typeof value === "function") {
        found.set(`${keyOf(file)}#${name}`, value as Action);
      }
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// Callers.
// ---------------------------------------------------------------------------

type Role = "ADMIN" | "EMPLOYEE";

function caller(
  role: Role,
  overrides: { active?: boolean; sessionVersion?: number } = {}
) {
  auth.mockResolvedValue({ user: { id: "user-1", sessionVersion: 3 } });
  findUnique.mockResolvedValue({
    id: "user-1",
    name: "Staff",
    email: "staff@example.test",
    role,
    active: true,
    sessionVersion: 3,
    mustChangePassword: false,
    ...overrides,
  });
}

/** What the action did, flattened so a throw and a return compare alike. */
async function outcome(run: () => Promise<unknown>) {
  try {
    const value = await run();
    if (
      value &&
      typeof value === "object" &&
      "error" in value &&
      value.error === dictionaries.en["err.forbidden"]
    ) {
      return { kind: "forbidden" as const };
    }
    return { kind: "returned" as const, value };
  } catch (error) {
    if (error instanceof Redirected) {
      return { kind: "redirected" as const, to: error.to };
    }
    if (error instanceof Error && error.name === "ForbiddenError") {
      return { kind: "forbidden" as const };
    }
    return { kind: "threw" as const, error };
  }
}

const SESSION_REFUSALS = [
  ["signed out", () => auth.mockResolvedValue(null)],
  [
    "a session for a user who no longer exists",
    () => {
      auth.mockResolvedValue({ user: { id: "gone", sessionVersion: 3 } });
      findUnique.mockResolvedValue(null);
    },
  ],
  // ADMIN, so that only the deactivation can be what refuses it.
  ["a deactivated ADMIN", () => caller("ADMIN", { active: false })],
  // The token carries 3; the row has moved on to 4 (a password reset, a
  // role change, "sign out everywhere").
  [
    "an ADMIN with a stale sessionVersion",
    () => caller("ADMIN", { sessionVersion: 4 }),
  ],
] as const;

/**
 * A call the guard let through: it returned (an { error } from the mocked
 * services' empty answers is fine) or redirected somewhere other than sign-in,
 * as the vehicle saves do. A throw is not "let through": it is an error page.
 */
function expectLetThrough(result: Awaited<ReturnType<typeof outcome>>) {
  const label = JSON.stringify(result);
  expect(["returned", "redirected"], label).toContain(result.kind);
  if (result.kind === "redirected") expect(result.to, label).not.toBe("/login");
}

const publicActions = Object.entries(ACTIONS).filter(
  ([, entry]) => entry.level === "PUBLIC"
);
const guarded = Object.entries(ACTIONS).filter(
  ([, entry]) => entry.level !== "PUBLIC"
);
const adminOnly = guarded.filter(([, entry]) => entry.level === "ADMIN");
const employeeOk = guarded.filter(([, entry]) => entry.level !== "ADMIN");

let actions: Map<string, Action>;

beforeEach(async () => {
  vi.clearAllMocks();
  auth.mockReset();
  findUnique.mockReset();
  vi.mocked(consumeRateLimit).mockResolvedValue({
    allowed: true,
    remaining: 10,
    retryAfter: 0,
  });
  // The one result an action dereferences outside its try: the new vehicle's
  // id, for the redirect to its edit page.
  vi.mocked(createVehicle).mockResolvedValue({ id: "vehicle-1" } as never);
});

beforeAll(async () => {
  actions = await discoverActions();
  spies = await collectSpies();
});

const run = (key: string) => () => ACTIONS[key].call(actions.get(key)!);

describe("the server-action inventory", () => {
  it("finds the server-action modules at all", () => {
    // Guards the discovery itself: a regex that matched nothing would make
    // every test below vacuous.
    expect(serverModules.length).toBeGreaterThanOrEqual(9);
  });

  it("lists every exported server action in the authorization table", async () => {
    const found = [...(await discoverActions()).keys()].sort();
    const listed = Object.keys(ACTIONS).sort();
    // A failure here means an action was added (or renamed) without a row in
    // ACTIONS saying who may call it. Add one, and its guard.
    expect(found).toEqual(listed);
  });

  it("gives every unguarded action a written reason", () => {
    for (const [key, entry] of Object.entries(ACTIONS)) {
      if (entry.level === "PUBLIC") {
        expect(entry.publicBecause, key).toMatch(/\w{10,}/);
      }
    }
  });

  it("pins every inline 'use server' closure to a reviewed file", () => {
    const inline = files
      .filter((f) => !serverModules.includes(f))
      .filter((f) =>
        /^\s*["']use server["'];?\s*$/m.test(readFileSync(f, "utf8"))
      )
      .map((f) => path.relative(ROOT, f).split(path.sep).join("/"))
      .sort();
    expect(inline).toEqual([...INLINE_SERVER_ACTIONS].sort());
  });
});

describe.each(SESSION_REFUSALS)("%s", (_who, arrange) => {
  it.each(guarded.map(([key]) => [key]))(
    "is sent to sign in by %s, which reaches nothing",
    async (key) => {
      arrange();
      expect(await outcome(run(key))).toEqual({
        kind: "redirected",
        to: "/login",
      });
      expect(auth).toHaveBeenCalled();
      expect(reachedDownstream()).toEqual([]);
    }
  );
});

describe("an active EMPLOYEE", () => {
  it.each(adminOnly.map(([key]) => [key]))(
    "is forbidden %s, which reaches nothing",
    async (key) => {
      caller("EMPLOYEE");
      expect(await outcome(run(key))).toEqual({ kind: "forbidden" });
      expect(reachedDownstream()).toEqual([]);
    }
  );

  it.each(employeeOk.map(([key]) => [key]))(
    "is let through %s",
    async (key) => {
      // The control for the refusals: the same input with a caller who is
      // allowed does reach the layer below, so a refusal above is the guard
      // and not the input failing validation.
      caller("EMPLOYEE");
      expectLetThrough(await outcome(run(key)));
      expect(reachedDownstream()).not.toEqual([]);
    }
  );
});

describe("an active ADMIN", () => {
  it.each(guarded.map(([key]) => [key]))("is let through %s", async (key) => {
    caller("ADMIN");
    expectLetThrough(await outcome(run(key)));
    expect(reachedDownstream()).not.toEqual([]);
  });
});

describe("the deliberately public actions", () => {
  it.each(publicActions.map(([key]) => [key]))(
    "%s works signed out, never consults the session, and only sets a cookie",
    async (key) => {
      auth.mockResolvedValue(null);
      expectLetThrough(await outcome(run(key)));
      expect(auth).not.toHaveBeenCalled();
      expect(findUnique).not.toHaveBeenCalled();
      expect(reachedDownstream()).toEqual(["next/headers#cookies"]);
    }
  );

  it("refuses a locale it does not support, without touching the cookie", async () => {
    const setLocale = actions.get(
      "../lib/i18n/locale-actions.ts#setLocaleAction"
    )!;
    await expect(
      setLocale(...(["xx; Path=/admin"] as never[]))
    ).rejects.toThrow("Unsupported locale");
    expect(reachedDownstream()).toEqual([]);
  });
});
