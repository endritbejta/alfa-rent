import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { AppError } from "@/lib/errors";
import { dictionaries, translate } from "@/lib/i18n/translations";
import { purgeAuditEvents } from "@/lib/testing/audit";
import {
  addVehicleService,
  deleteVehicleService,
  updateVehicleService,
} from "@/services/fleet.service";

/**
 * Services as rows (audit P2-5c): the migration's backfill, the writes and
 * their audit events, and who may make them.
 */

const session = vi.hoisted(() => ({
  current: null as null | { user: { id: string; sessionVersion: number } },
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));
vi.mock("@/lib/auth", () => ({ auth: async () => session.current }));
vi.mock("@/lib/i18n/server", () => ({
  getI18n: async () => ({
    locale: "en",
    dictionary: dictionaries.en,
    t: (key: keyof typeof dictionaries.en) => translate(dictionaries.en, key),
  }),
}));

const { addVehicleServiceAction, deleteVehicleServiceAction } =
  await import("@/app/(dashboard)/admin/vehicles/actions");

const suffix = randomUUID().slice(0, 8);
const id = (name: string) => `svc-${name}-${suffix}`;
const ids = {
  admin: id("admin"),
  employee: id("employee"),
  car: id("car"),
  other: id("other"),
  // Backfill fixtures, one per shape of old data.
  dated: id("dated"),
  dateOnly: id("date-only"),
  costOnly: id("cost-only"),
  neither: id("neither"),
};
const vehicleIds = [
  ids.car,
  ids.other,
  ids.dated,
  ids.dateOnly,
  ids.costOnly,
  ids.neither,
];

const vehicle = (vehicleId: string, extra: object = {}) => ({
  id: vehicleId,
  slug: vehicleId,
  brand: "Service",
  model: vehicleId,
  year: 2026,
  category: "SEDAN" as const,
  transmission: "MANUAL" as const,
  fuelType: "PETROL" as const,
  seats: 5,
  pricePerDay: 40,
  description: "Integration-test vehicle for service history.",
  ...extra,
});

const form = (entries: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(entries)) data.set(k, v);
  return data;
};

beforeAll(async () => {
  await prisma.user.createMany({
    data: [
      { id: ids.admin, role: "ADMIN" as const },
      { id: ids.employee, role: "EMPLOYEE" as const },
    ].map((u) => ({
      ...u,
      name: `Service ${u.role}`,
      email: `${u.id}@example.test`,
      password: "!",
    })),
  });
  await prisma.vehicle.createMany({
    data: [
      vehicle(ids.car),
      vehicle(ids.other),
      vehicle(ids.dated, {
        lastServiceDate: new Date("2026-03-27T09:00:00.000Z"),
        serviceCost: 145.5,
      }),
      vehicle(ids.dateOnly, {
        lastServiceDate: new Date("2026-02-12T09:00:00.000Z"),
      }),
      vehicle(ids.costOnly, {
        serviceCost: 80,
        createdAt: new Date("2025-06-01T14:00:00.000Z"),
      }),
      vehicle(ids.neither),
    ],
  });
});

afterAll(async () => {
  await purgeAuditEvents({
    actorIds: [ids.admin, ids.employee],
    entityIds: vehicleIds,
  });
  await prisma.vehicle.deleteMany({ where: { id: { in: vehicleIds } } });
  await prisma.user.deleteMany({
    where: { id: { in: [ids.admin, ids.employee] } },
  });
  await prisma.$disconnect();
});

describe("the backfill from the old last-service columns", () => {
  /**
   * Runs the migration's own INSERT, read from the file, scoped to this
   * test's vehicles — so what is tested is what production ran, without
   * touching anyone else's rows (theirs were backfilled when it applied).
   */
  beforeAll(async () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        "prisma/migrations/20261117120000_vehicle_services/migration.sql"
      ),
      "utf8"
    );
    const insert = sql.match(/INSERT INTO "vehicle_services"[\s\S]*?\);/)?.[0];
    expect(insert).toBeDefined();
    const scope = vehicleIds.map((v) => `'${v}'`).join(", ");
    await prisma.$executeRawUnsafe(
      insert!.replace(/;$/, ` AND v."id" IN (${scope});`)
    );
  });

  const rowsOf = (vehicleId: string) =>
    prisma.vehicleService.findMany({ where: { vehicleId } });

  it("gives a vehicle with a recorded last service exactly one row", async () => {
    const rows = await rowsOf(ids.dated);
    expect(rows).toHaveLength(1);
    // The calendar day, at 00:00 like every other stored date.
    expect(rows[0]!.date).toEqual(new Date("2026-03-27T00:00:00.000Z"));
    expect(rows[0]!.cost.toFixed(2)).toBe("145.50");
    expect(rows[0]!.mileage).toBeNull();
    expect(rows[0]!.notes).toBeNull();
    expect(rows[0]!.createdById).toBeNull();
  });

  it("records a dated service with no cost as costing 0", async () => {
    const rows = await rowsOf(ids.dateOnly);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.date).toEqual(new Date("2026-02-12T00:00:00.000Z"));
    expect(rows[0]!.cost.toFixed(2)).toBe("0.00");
  });

  it("keeps a cost with no date, dated to when the car was added and saying so", async () => {
    const rows = await rowsOf(ids.costOnly);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.date).toEqual(new Date("2025-06-01T00:00:00.000Z"));
    expect(rows[0]!.cost.toFixed(2)).toBe("80.00");
    expect(rows[0]!.notes).toMatch(/date not recorded/i);
  });

  it("adds nothing for a vehicle with no service on record", async () => {
    expect(await rowsOf(ids.neither)).toHaveLength(0);
    expect(await rowsOf(ids.car)).toHaveLength(0);
  });
});

describe("recording, editing and removing a service", () => {
  const NOW = new Date("2026-11-13T12:00:00.000Z");
  const events = (action: string) =>
    prisma.auditEvent.findMany({
      where: { entityId: ids.car, action },
      orderBy: { createdAt: "asc" },
    });

  it("adds, edits and deletes, recording one event each", async () => {
    const added = await addVehicleService(
      ids.car,
      {
        date: new Date("2026-10-01T00:00:00.000Z"),
        cost: 89.9,
        mileage: 41200,
        notes: "Oil and filters",
      },
      ids.admin,
      NOW
    );
    expect(added.createdById).toBe(ids.admin);
    const [add] = await events("vehicle.addService");
    expect(add).toMatchObject({ actorId: ids.admin, entity: "vehicle" });
    expect(add!.after).toEqual({
      serviceId: added.id,
      date: "2026-10-01T00:00:00.000Z",
      cost: "89.90",
      mileage: 41200,
    });

    // Clearing the mileage and notes must write NULL, not leave them.
    const edited = await updateVehicleService(
      ids.car,
      added.id,
      { date: new Date("2026-10-02T00:00:00.000Z"), cost: 95 },
      ids.admin,
      NOW
    );
    expect(edited.cost.toFixed(2)).toBe("95.00");
    expect(edited.mileage).toBeNull();
    expect(edited.notes).toBeNull();
    const [update] = await events("vehicle.updateService");
    expect(update!.before).toEqual({
      serviceId: added.id,
      date: "2026-10-01T00:00:00.000Z",
      cost: "89.90",
      mileage: 41200,
      notes: "Oil and filters",
    });
    expect(update!.after).toEqual({
      serviceId: added.id,
      date: "2026-10-02T00:00:00.000Z",
      cost: "95.00",
      mileage: null,
      notes: null,
    });

    // The same values again change nothing and record nothing.
    await updateVehicleService(
      ids.car,
      added.id,
      { date: new Date("2026-10-02T00:00:00.000Z"), cost: 95 },
      ids.admin,
      NOW
    );
    expect(await events("vehicle.updateService")).toHaveLength(1);

    await deleteVehicleService(ids.car, added.id, ids.admin);
    expect(
      await prisma.vehicleService.findUnique({ where: { id: added.id } })
    ).toBeNull();
    const [remove] = await events("vehicle.deleteService");
    expect(remove!.before).toMatchObject({
      serviceId: added.id,
      cost: "95.00",
    });
  });

  it("refuses a service dated after the branch's today", async () => {
    await expect(
      addVehicleService(
        ids.car,
        { date: new Date("2026-11-14T00:00:00.000Z"), cost: 50 },
        ids.admin,
        NOW
      )
    ).rejects.toBeInstanceOf(AppError);
    // Today itself is fine.
    const today = await addVehicleService(
      ids.car,
      { date: new Date("2026-11-13T00:00:00.000Z"), cost: 50 },
      ids.admin,
      NOW
    );
    await deleteVehicleService(ids.car, today.id, ids.admin);
  });

  it("will not edit or delete another car's service through this one", async () => {
    const theirs = await addVehicleService(
      ids.other,
      { date: new Date("2026-09-01T00:00:00.000Z"), cost: 70 },
      ids.admin,
      NOW
    );
    await expect(
      updateVehicleService(
        ids.car,
        theirs.id,
        { date: new Date("2026-09-01T00:00:00.000Z"), cost: 1 },
        ids.admin,
        NOW
      )
    ).rejects.toBeInstanceOf(AppError);
    await expect(
      deleteVehicleService(ids.car, theirs.id, ids.admin)
    ).rejects.toBeInstanceOf(AppError);
    const still = await prisma.vehicleService.findUniqueOrThrow({
      where: { id: theirs.id },
    });
    expect(still.cost.toFixed(2)).toBe("70.00");
  });

  it("refuses a negative cost at the database too", async () => {
    await expect(
      prisma.vehicleService.create({
        data: { vehicleId: ids.car, date: NOW, cost: -1 },
      })
    ).rejects.toThrow(/vehicle_services_cost_nonnegative/);
  });
});

describe("who may record services", () => {
  const valid = form({ "service-date": "2026-10-01", "service-cost": "60" });

  it("forbids an employee, and writes nothing", async () => {
    session.current = { user: { id: ids.employee, sessionVersion: 0 } };
    await expect(addVehicleServiceAction(ids.other, valid)).rejects.toThrow(
      /forbidden|permission/i
    );
    const svc = await prisma.vehicleService.findFirstOrThrow({
      where: { vehicleId: ids.other },
    });
    await expect(deleteVehicleServiceAction(ids.other, svc.id)).rejects.toThrow(
      /forbidden|permission/i
    );
    expect(
      await prisma.auditEvent.count({ where: { actorId: ids.employee } })
    ).toBe(0);
  });

  it("lets an admin, and returns a validation error as { error }", async () => {
    session.current = { user: { id: ids.admin, sessionVersion: 0 } };
    const before = await prisma.vehicleService.count({
      where: { vehicleId: ids.other },
    });
    expect(await addVehicleServiceAction(ids.other, valid)).toBeUndefined();
    expect(
      await prisma.vehicleService.count({ where: { vehicleId: ids.other } })
    ).toBe(before + 1);

    const refused = await addVehicleServiceAction(
      ids.other,
      form({ "service-date": "2026-10-01", "service-cost": "-5" })
    );
    expect(refused).toEqual({ error: expect.any(String) });
  });
});
