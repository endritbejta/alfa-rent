import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { AppError } from "@/lib/errors";
import { dictionaries, translate } from "@/lib/i18n/translations";
import { recordAudit, type AuditAction } from "@/lib/audit";
import { businessDay } from "@/lib/business-time";
import { rentalInspectionSchema } from "@/lib/validations/inspection";
import { purgeAuditEvents } from "@/lib/testing/audit";
import {
  createManualReservation,
  extendReservation,
  updateReservationStatus,
} from "@/services/reservation.service";
import {
  recordPastRental,
  recordRentalInspection,
} from "@/services/inspection.service";
import {
  anonymiseCustomer,
  mergeCustomers,
  updateCustomer,
} from "@/services/customer.service";
import {
  createVehicle,
  deleteVehicle,
  updateVehicle,
} from "@/services/vehicle.service";
import { addRepair, deleteRepair } from "@/services/fleet.service";
import {
  changeOwnPassword,
  changeStaffRole,
  createStaff,
  deactivateStaff,
  reactivateStaff,
  resetStaffPassword,
  signOutStaffEverywhere,
} from "@/services/staff.service";
import { getAuditHistory } from "@/services/audit.service";

/*
 * The staff audit trail (audit finding P2-7), against a real database:
 * every staff write records exactly one event, inside the change's own
 * transaction; the table refuses to be rewritten; and anonymising a customer
 * takes their details out of the trail as well as out of the records.
 *
 * The cancel action is driven for real too, through requireRole, so the
 * "a reason is required" refusal is proven where staff meet it.
 */
const session = vi.hoisted(() => ({
  current: null as null | { user: { id: string; sessionVersion: number } },
}));
vi.mock("server-only", () => ({}));
// The status action schedules the customer's email with after(), which needs
// a request scope; the emails have their own suite.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: () => {},
}));
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

const { updateReservationStatusAction } =
  await import("@/app/(dashboard)/admin/reservations/actions");

const suffix = randomUUID().slice(0, 8);
const id = (name: string) => `audit-${name}-${suffix}`;
const email = (who: string) => `audit-${who}-${suffix}@example.test`;
const PASSWORD = "integration passphrase";

const ids = {
  admin: id("admin"),
  employee: id("employee"),
  car: id("car"),
  pastCar: id("past-car"),
  customer: id("customer"),
  other: id("other"),
};
/** Every entity id an event may be about, for clean-up. */
const touched = new Set<string>(Object.values(ids));
const vehicleIds = new Set([ids.car, ids.pastCar]);
const customerIds = new Set([ids.customer, ids.other]);

/** A rental day in the booking model: the calendar day at 10:00 "UTC". */
const today = businessDay(new Date());
const dayAt = (offset: number) => {
  const d = new Date(`${today}T10:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
};
const dayKey = (offset: number) => dayAt(offset).toISOString().slice(0, 10);

const vehicleData = (vehicleId: string, slug: string) => ({
  id: vehicleId,
  slug: `${slug}-${suffix}`,
  brand: "Audit",
  model: slug,
  year: 2026,
  category: "SEDAN" as const,
  transmission: "MANUAL" as const,
  fuelType: "PETROL" as const,
  seats: 5,
  pricePerDay: 40,
  description: "Integration-test vehicle for the audit trail.",
});

beforeAll(async () => {
  const hash = await bcrypt.hash(PASSWORD, 4);
  await prisma.user.createMany({
    data: [
      { id: ids.admin, role: "ADMIN" as const },
      { id: ids.employee, role: "EMPLOYEE" as const },
    ].map((u) => ({
      ...u,
      name: `Audit ${u.role}`,
      email: email(u.id),
      password: hash,
    })),
  });
  await prisma.vehicle.createMany({
    data: [vehicleData(ids.car, "car"), vehicleData(ids.pastCar, "past")],
  });
  await prisma.customer.createMany({
    data: [
      {
        id: ids.customer,
        firstName: "Arta",
        lastName: "Audit",
        email: email("customer"),
        phone: "+383 44 111 222",
      },
      {
        id: ids.other,
        firstName: "Besa",
        lastName: "Audit",
        email: email("other"),
        phone: "+383 44 333 444",
      },
    ],
  });
});

afterAll(async () => {
  const staff = await prisma.user.findMany({
    where: { email: { contains: suffix } },
    select: { id: true },
  });
  const staffIds = staff.map((u) => u.id);
  staffIds.forEach((s) => touched.add(s));
  await purgeAuditEvents({ actorIds: staffIds, entityIds: [...touched] });
  await prisma.reservation.deleteMany({
    where: { vehicleId: { in: [...vehicleIds] } },
  });
  await prisma.repair.deleteMany({
    where: { vehicleId: { in: [...vehicleIds] } },
  });
  await prisma.vehicle.deleteMany({ where: { id: { in: [...vehicleIds] } } });
  await prisma.customer.deleteMany({
    where: { id: { in: [...customerIds] } },
  });
  await prisma.user.deleteMany({ where: { id: { in: staffIds } } });
  await prisma.$disconnect();
});

async function reservation(
  status: "PENDING" | "CONFIRMED",
  from: number,
  to: number,
  vehicleId = ids.car,
  customerId = ids.customer
) {
  const created = await prisma.reservation.create({
    data: {
      vehicleId,
      customerId,
      pickupDate: dayAt(from),
      returnDate: dayAt(to),
      status,
      totalPrice: 40 * (to - from + 1),
    },
  });
  touched.add(created.id);
  return created.id;
}

/**
 * Runs one write and returns the single event it recorded, failing if it
 * recorded none or more than one. Events are found by actor, so an event
 * about the wrong record still counts and is caught by the caller.
 */
async function oneEvent(actorId: string, run: () => Promise<unknown>) {
  const byActor = () =>
    prisma.auditEvent.findMany({ where: { actorId }, orderBy: { id: "asc" } });
  const seen = new Set((await byActor()).map((e) => e.id));
  await run();
  const events = (await byActor()).filter((e) => !seen.has(e.id));
  expect(events).toHaveLength(1);
  touched.add(events[0]!.entityId);
  return events[0]!;
}

function expectEvent(
  event: {
    action: string;
    entity: string;
    entityId: string;
    actorId: string | null;
  },
  action: AuditAction,
  entityId: string,
  actorId: string
) {
  expect(event).toMatchObject({
    action,
    entity: action.split(".")[0],
    entityId,
    actorId,
  });
}

async function refusedWith(run: Promise<unknown>, key: string) {
  const error = await run.then(
    () => null,
    (caught: unknown) => caught
  );
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).text?.key).toBe(key);
}

const eventCount = (entityId: string) =>
  prisma.auditEvent.count({ where: { entityId } });

// ---------------------------------------------------------------------------

describe("every staff write records exactly one event", () => {
  it("reservations: create, confirm, extend, cancel", async () => {
    let reservationId = "";
    const create = await oneEvent(ids.employee, async () => {
      reservationId = (
        await createManualReservation(
          {
            vehicleId: ids.car,
            customer: { kind: "existing", id: ids.customer },
            pickupDate: dayAt(30),
            returnDate: dayAt(32),
            status: "PENDING",
            notes: "Flight LH123, staying at the Swiss Diamond",
          },
          ids.employee
        )
      ).id;
    });
    expectEvent(create, "reservation.create", reservationId, ids.employee);
    // Free text about the customer stays out of the event.
    expect(JSON.stringify(create.after)).not.toContain("LH123");

    const confirm = await oneEvent(ids.employee, () =>
      updateReservationStatus(reservationId, "CONFIRMED", ids.employee)
    );
    expectEvent(confirm, "reservation.confirm", reservationId, ids.employee);
    expect(confirm.before).toEqual({ status: "PENDING" });
    expect(confirm.after).toEqual({ status: "CONFIRMED" });

    const extend = await oneEvent(ids.admin, () =>
      extendReservation(reservationId, dayAt(34), ids.admin)
    );
    expectEvent(extend, "reservation.extend", reservationId, ids.admin);
    expect(extend.before).toEqual({
      returnDate: dayAt(32).toISOString(),
      totalPrice: "120.00",
    });
    expect(extend.after).toEqual({
      returnDate: dayAt(34).toISOString(),
      totalPrice: "200.00",
    });

    const cancel = await oneEvent(ids.employee, () =>
      updateReservationStatus(
        reservationId,
        "CANCELLED",
        ids.employee,
        "  Customer called: the trip is off  "
      )
    );
    expectEvent(cancel, "reservation.cancel", reservationId, ids.employee);
    expect(cancel.reason).toBe("Customer called: the trip is off");
  });

  it("inspections: start and complete a rental", async () => {
    const reservationId = await reservation("CONFIRMED", 0, 1);
    const input = (type: "PICKUP" | "RETURN", mileage: number) =>
      rentalInspectionSchema.parse({
        type,
        mileage,
        fuelLevel: 100,
        damageFound: false,
        signerName: "Arta Audit",
        customerAcknowledged: true,
        photos: [],
      });

    const start = await oneEvent(ids.employee, () =>
      recordRentalInspection(reservationId, ids.employee, input("PICKUP", 1000))
    );
    expectEvent(start, "reservation.start", reservationId, ids.employee);
    expect(start.after).toMatchObject({ status: "ACTIVE", lateStart: false });
    // The signer is a person's name: not for the trail.
    expect(JSON.stringify(start.after)).not.toContain("Arta");

    const complete = await oneEvent(ids.admin, () =>
      recordRentalInspection(reservationId, ids.admin, input("RETURN", 1200))
    );
    expectEvent(complete, "reservation.complete", reservationId, ids.admin);
    expect(complete.after).toMatchObject({
      status: "COMPLETED",
      vehicleStatus: "AVAILABLE",
    });
  });

  it("a late start is recorded as one", async () => {
    const reservationId = await reservation("CONFIRMED", -2, 3);
    const start = await oneEvent(ids.employee, () =>
      recordRentalInspection(
        reservationId,
        ids.employee,
        rentalInspectionSchema.parse({
          type: "PICKUP",
          mileage: 1300,
          fuelLevel: 80,
          damageFound: false,
          signerName: "Arta Audit",
          customerAcknowledged: true,
          photos: [],
          lateStartConfirmed: true,
          occurredOn: dayKey(-1),
        })
      )
    );
    expectEvent(start, "reservation.start", reservationId, ids.employee);
    expect(start.after).toMatchObject({ lateStart: true });
    // Hand the car back so later tests find it AVAILABLE.
    await prisma.reservation.update({
      where: { id: reservationId },
      data: { status: "COMPLETED" },
    });
    await prisma.vehicle.update({
      where: { id: ids.car },
      data: { status: "AVAILABLE" },
    });
  });

  it("recording a past rental keeps the note as the reason", async () => {
    const reservationId = await reservation("CONFIRMED", -20, -18, ids.pastCar);
    const event = await oneEvent(ids.employee, () =>
      recordPastRental(reservationId, ids.employee, {
        startedOn: dayKey(-20),
        returnedOn: dayKey(-18),
        note: "Nobody pressed Start at the counter",
        confirmed: true,
      })
    );
    expectEvent(event, "reservation.recordPast", reservationId, ids.employee);
    expect(event.reason).toBe("Nobody pressed Start at the counter");
  });

  it("customers: update records only the changed fields; merge names what it folded in", async () => {
    const update = await oneEvent(ids.employee, () =>
      updateCustomer(
        ids.other,
        {
          firstName: "Besa",
          lastName: "Audit",
          email: email("other"),
          phone: "+383 44 999 000",
          notes: null,
        },
        ids.employee
      )
    );
    expectEvent(update, "customer.update", ids.other, ids.employee);
    expect(update.before).toEqual({ phone: "+383 44 333 444" });
    expect(update.after).toEqual({ phone: "+383 44 999 000" });

    // Saving the same details again changes nothing and records nothing.
    const before = await eventCount(ids.other);
    await updateCustomer(
      ids.other,
      {
        firstName: "Besa",
        lastName: "Audit",
        email: email("other"),
        phone: "+383 44 999 000",
        notes: null,
      },
      ids.employee
    );
    expect(await eventCount(ids.other)).toBe(before);

    const keep = await prisma.customer.create({
      data: {
        firstName: "Keep",
        lastName: "Audit",
        email: email("keep"),
        phone: "-",
      },
    });
    customerIds.add(keep.id);
    const merge = await oneEvent(ids.admin, () =>
      mergeCustomers({ keepId: keep.id, mergeIds: [ids.other] }, ids.admin)
    );
    expectEvent(merge, "customer.merge", keep.id, ids.admin);
    expect(merge.after).toMatchObject({
      mergedIds: [ids.other],
      movedReservations: 0,
      phone: "+383 44 999 000",
    });
  });

  it("vehicles: create, update, repairs, retire and delete", async () => {
    let vehicleId = "";
    const create = await oneEvent(ids.admin, async () => {
      vehicleId = (
        await createVehicle(
          {
            brand: "Audit",
            model: "Created",
            plate: `AU${suffix}`.slice(0, 15).toUpperCase(),
            year: 2025,
            category: "SUV",
            transmission: "AUTOMATIC",
            fuelType: "DIESEL",
            seats: 5,
            pricePerDay: 60,
            description: "Created by the audit-trail integration test.",
            status: "AVAILABLE",
          },
          ids.admin
        )
      ).id;
    });
    vehicleIds.add(vehicleId);
    expectEvent(create, "vehicle.create", vehicleId, ids.admin);
    expect(create.after).toMatchObject({ pricePerDay: "60.00" });
    // The plate stays internal: never in the public URL (P3-2).
    const created = await prisma.vehicle.findUniqueOrThrow({
      where: { id: vehicleId },
      select: { slug: true, plate: true },
    });
    expect(created.slug).toMatch(/^audit-created-2025-[a-z0-9]{8}$/);
    expect(created.slug).not.toContain(created.plate!.toLowerCase());

    const update = await oneEvent(ids.admin, () =>
      updateVehicle(
        vehicleId,
        { pricePerDay: 60, status: "SERVICE", seats: 5 },
        ids.admin
      )
    );
    expectEvent(update, "vehicle.update", vehicleId, ids.admin);
    // 60 against a stored 60.00 is no change; only the status moved.
    expect(update.before).toEqual({ status: "AVAILABLE" });
    expect(update.after).toEqual({ status: "SERVICE" });

    let repairId = "";
    const add = await oneEvent(ids.admin, async () => {
      repairId = (
        await addRepair(
          vehicleId,
          {
            date: new Date("2026-10-01T00:00:00.000Z"),
            cost: 120.5,
            description: "Front brake pads",
          },
          ids.admin
        )
      ).id;
    });
    expectEvent(add, "vehicle.addRepair", vehicleId, ids.admin);
    expect(add.after).toMatchObject({ repairId, cost: "120.50" });

    const remove = await oneEvent(ids.admin, () =>
      deleteRepair(repairId, ids.admin)
    );
    expectEvent(remove, "vehicle.deleteRepair", vehicleId, ids.admin);

    const removed = await oneEvent(ids.admin, () =>
      deleteVehicle(vehicleId, ids.admin)
    );
    expectEvent(removed, "vehicle.delete", vehicleId, ids.admin);
    expect(removed.before).toMatchObject({ brand: "Audit", model: "Created" });

    // A car with history is retired, not deleted.
    const retire = await oneEvent(ids.admin, () =>
      deleteVehicle(ids.pastCar, ids.admin)
    );
    expectEvent(retire, "vehicle.retire", ids.pastCar, ids.admin);
    expect(retire.after).toEqual({ status: "INACTIVE" });
  });

  it("staff: the whole account lifecycle, and never a password", async () => {
    let staffId = "";
    const create = await oneEvent(ids.admin, async () => {
      staffId = (
        await createStaff(ids.admin, {
          name: "New Hire",
          email: email("hire"),
          role: "EMPLOYEE",
          temporaryPassword: PASSWORD,
        })
      ).id;
    });
    expectEvent(create, "staff.create", staffId, ids.admin);
    expect(create.after).toEqual({
      name: "New Hire",
      email: email("hire"),
      role: "EMPLOYEE",
    });

    const steps: [AuditAction, () => Promise<unknown>][] = [
      ["staff.changeRole", () => changeStaffRole(ids.admin, staffId, "ADMIN")],
      [
        "staff.changeRole",
        () => changeStaffRole(ids.admin, staffId, "EMPLOYEE"),
      ],
      [
        "staff.resetPassword",
        () => resetStaffPassword(ids.admin, staffId, "another passphrase"),
      ],
      [
        "staff.signOutEverywhere",
        () => signOutStaffEverywhere(ids.admin, staffId),
      ],
      ["staff.deactivate", () => deactivateStaff(ids.admin, staffId)],
      ["staff.reactivate", () => reactivateStaff(ids.admin, staffId)],
    ];
    for (const [action, run] of steps) {
      expectEvent(await oneEvent(ids.admin, run), action, staffId, ids.admin);
    }

    const own = await oneEvent(staffId, () =>
      changeOwnPassword(staffId, "another passphrase", "my very own passphrase")
    );
    expectEvent(own, "staff.changeOwnPassword", staffId, staffId);

    const all = await prisma.auditEvent.findMany({
      where: { entityId: staffId },
    });
    const text = JSON.stringify(all);
    expect(text).not.toMatch(/passphrase|\$2[aby]\$/);
    expect(text).not.toContain("sessionVersion");
  });
});

describe("an event lives and dies with its change", () => {
  it("rolls back with the transaction it was recorded in", async () => {
    const entityId = id("rolled-back");
    await expect(
      prisma.$transaction(async (tx) => {
        await recordAudit(tx, {
          actorId: ids.admin,
          action: "customer.update",
          entityId,
          after: { phone: "x" },
        });
        throw new Error("the change failed after the event was written");
      })
    ).rejects.toThrow("the change failed");
    expect(await eventCount(entityId)).toBe(0);
  });

  it("a refused change records nothing", async () => {
    const reservationId = await reservation("PENDING", 40, 41);
    // Already-past-its-day requests cannot be confirmed; a bad transition
    // likewise. Neither may leave a trace that it happened.
    await refusedWith(
      updateReservationStatus(reservationId, "COMPLETED", ids.employee),
      "err.badTransition"
    );
    expect(await eventCount(reservationId)).toBe(0);
  });

  it("if the event cannot be written, the change is undone too", async () => {
    // An actor that does not exist trips the foreign key on the event insert,
    // the last statement of the transaction.
    await expect(
      updateCustomer(
        ids.customer,
        {
          firstName: "Changed",
          lastName: "Audit",
          email: email("customer"),
          phone: "+383 44 111 222",
          notes: null,
        },
        id("nobody")
      )
    ).rejects.toThrow();
    const after = await prisma.customer.findUniqueOrThrow({
      where: { id: ids.customer },
    });
    expect(after.firstName).toBe("Arta");
  });
});

describe("cancelling needs a reason", () => {
  async function signInAs(userId: string) {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    session.current = {
      user: { id: user.id, sessionVersion: user.sessionVersion },
    };
  }

  it("is refused by the action without one, or with too short a one", async () => {
    const reservationId = await reservation("PENDING", 50, 51);
    await signInAs(ids.employee);
    const message = translate(dictionaries.en, "err.cancelReasonRequired", {
      count: 10,
    });

    for (const reason of [undefined, null, "", "   ", "too short"]) {
      await expect(
        updateReservationStatusAction(reservationId, "CANCELLED", reason)
      ).resolves.toEqual({ error: message });
    }
    const still = await prisma.reservation.findUniqueOrThrow({
      where: { id: reservationId },
    });
    expect(still.status).toBe("PENDING");
    expect(await eventCount(reservationId)).toBe(0);

    await expect(
      updateReservationStatusAction(
        reservationId,
        "CANCELLED",
        "Double booking made by mistake"
      )
    ).resolves.toBeUndefined();
    const [event] = await prisma.auditEvent.findMany({
      where: { entityId: reservationId },
    });
    expect(event).toMatchObject({
      action: "reservation.cancel",
      actorId: ids.employee,
      reason: "Double booking made by mistake",
    });
  });

  it("is refused by the service for any other caller", async () => {
    const reservationId = await reservation("PENDING", 52, 53);
    await refusedWith(
      updateReservationStatus(reservationId, "CANCELLED", ids.admin),
      "err.cancelReasonRequired"
    );
    expect(await eventCount(reservationId)).toBe(0);
  });

  it("confirming needs none", async () => {
    await signInAs(ids.employee);
    const reservationId = await reservation("PENDING", 54, 55);
    await expect(
      updateReservationStatusAction(reservationId, "CONFIRMED")
    ).resolves.toBeUndefined();
  });
});

describe("the table is append-only", () => {
  let eventId = "";
  beforeAll(async () => {
    const entityId = id("append-only");
    touched.add(entityId);
    await prisma.$transaction((tx) =>
      recordAudit(tx, {
        actorId: ids.admin,
        action: "customer.update",
        entityId,
        before: { phone: "1" },
        after: { phone: "2" },
        reason: "kept",
      })
    );
    eventId = (
      await prisma.auditEvent.findFirstOrThrow({ where: { entityId } })
    ).id;
  });

  it("refuses UPDATE, DELETE and TRUNCATE", async () => {
    await expect(
      prisma.auditEvent.update({
        where: { id: eventId },
        data: { reason: "rewritten" },
      })
    ).rejects.toThrow(/append-only/);
    await expect(
      prisma.auditEvent.update({
        where: { id: eventId },
        data: { actorId: ids.employee },
      })
    ).rejects.toThrow(/append-only/);
    await expect(
      prisma.auditEvent.delete({ where: { id: eventId } })
    ).rejects.toThrow(/append-only/);
    // Inside a transaction that is rolled back whatever happens, so a broken
    // trigger fails this test instead of emptying the local trail.
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRaw`TRUNCATE audit_events`;
        throw new Error("TRUNCATE was allowed");
      })
    ).rejects.toThrow(/append-only/);
    expect(
      await prisma.auditEvent.findUniqueOrThrow({ where: { id: eventId } })
    ).toMatchObject({ reason: "kept", actorId: ids.admin });
  });

  it("the scrub may only remove, never add or rewrite", async () => {
    const scrubbing = (
      run: (tx: Prisma.TransactionClient) => Promise<unknown>
    ) =>
      prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('alfa_rent.audit_scrub', 'on', true)`;
        await run(tx);
      });
    await expect(
      scrubbing((tx) =>
        tx.auditEvent.update({
          where: { id: eventId },
          data: { after: { phone: "2", forged: true } },
        })
      )
    ).rejects.toThrow(/append-only/);
    await expect(
      scrubbing((tx) =>
        tx.auditEvent.update({
          where: { id: eventId },
          data: { reason: "rewritten" },
        })
      )
    ).rejects.toThrow(/append-only/);
    await expect(
      scrubbing((tx) =>
        tx.auditEvent.update({
          where: { id: eventId },
          data: { action: "customer.merge" },
        })
      )
    ).rejects.toThrow(/append-only/);
  });

  it("removing the staff member keeps the event and reads 'removed'", async () => {
    const temp = await prisma.user.create({
      data: {
        name: "Leaving Soon",
        email: email("leaver"),
        password: "!",
      },
    });
    const entityId = id("removed-actor");
    touched.add(entityId);
    await prisma.$transaction((tx) =>
      recordAudit(tx, {
        actorId: temp.id,
        action: "customer.update",
        entityId,
        after: { phone: "3" },
      })
    );
    await prisma.$transaction((tx) =>
      recordAudit(tx, { actorId: null, action: "customer.update", entityId })
    );
    await prisma.user.delete({ where: { id: temp.id } });

    const history = await getAuditHistory("customer", entityId);
    expect(history.map((h) => h.actor.kind).sort()).toEqual([
      "removed",
      "system",
    ]);
  });
});

describe("anonymising scrubs the trail too", () => {
  it("strips personal data and reasons from earlier events, including merged records'", async () => {
    // A record later merged in, whose own edit holds a phone number.
    const merged = await prisma.customer.create({
      data: {
        firstName: "Old",
        lastName: "Duplicate",
        email: email("dup"),
        phone: "+383 49 555 666",
      },
    });
    customerIds.add(merged.id);
    await updateCustomer(
      merged.id,
      {
        firstName: "Old",
        lastName: "Duplicate",
        email: email("dup"),
        phone: "+383 49 555 777",
        notes: "Calls after 6pm",
      },
      ids.employee
    );
    await mergeCustomers(
      { keepId: ids.customer, mergeIds: [merged.id] },
      ids.admin
    );
    await updateCustomer(
      ids.customer,
      {
        firstName: "Arta",
        lastName: "Audit-Krasniqi",
        email: email("customer"),
        phone: "+383 44 111 000",
        notes: null,
      },
      ids.employee
    );
    const reservationId = await reservation("PENDING", 60, 61);
    await updateReservationStatus(
      reservationId,
      "CANCELLED",
      ids.employee,
      "Arta Audit-Krasniqi asked to cancel by phone"
    );
    // Open reservations block anonymising; this customer has none left
    // except the ones the earlier tests completed or cancelled.
    await prisma.reservation.updateMany({
      where: {
        customerId: ids.customer,
        status: { in: ["PENDING", "CONFIRMED", "ACTIVE"] },
      },
      data: { status: "CANCELLED" },
    });

    const anonymise = await oneEvent(ids.admin, () =>
      anonymiseCustomer(ids.customer, ids.admin)
    );
    expectEvent(anonymise, "customer.anonymise", ids.customer, ids.admin);
    expect(anonymise.after).toEqual({
      anonymised: true,
      reservations: expect.any(Number),
    });

    const reservationIds = (
      await prisma.reservation.findMany({
        where: { customerId: ids.customer },
        select: { id: true },
      })
    ).map((r) => r.id);
    const trail = await prisma.auditEvent.findMany({
      where: {
        entityId: { in: [ids.customer, merged.id, ...reservationIds] },
      },
    });
    // Edits of both records, the merge, the cancel, the anonymisation...
    expect(trail.length).toBeGreaterThanOrEqual(5);
    const text = JSON.stringify(trail);
    for (const erased of [
      "+383 44 111 000",
      "+383 44 111 222",
      "+383 49 555 777",
      "Audit-Krasniqi",
      "Calls after 6pm",
      "asked to cancel",
    ]) {
      expect(text).not.toContain(erased);
    }
    // ...while who did what, and when, survives.
    expect(trail.map((e) => e.action)).toEqual(
      expect.arrayContaining([
        "customer.update",
        "customer.merge",
        "reservation.cancel",
        "customer.anonymise",
      ])
    );
    const merge = trail.find((e) => e.action === "customer.merge")!;
    expect(merge.after).toMatchObject({ mergedIds: [merged.id] });
    expect(merge.actorId).toBe(ids.admin);
  });
});
