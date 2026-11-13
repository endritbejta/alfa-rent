import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";

/**
 * Asserts that the database objects `schema.prisma` does not model actually
 * exist in a live database.
 *
 * `prisma/rls-security.test.ts` checks that the SQL was *written*; CI proves it
 * *applies* to a fresh database. Neither notices if the objects are later
 * dropped — which is exactly what `prisma migrate dev`, `migrate reset` and
 * `db push` do, because they regenerate the schema from the model and the model
 * knows nothing about any of this. Four things would go silently:
 *
 *   - the reservations_no_overlap GiST exclusion constraint, which is the only
 *     real guarantee against double-booking
 *   - the btree_gist extension it depends on
 *   - row-level security on every table
 *   - two CHECK constraints on rental_inspections
 *   - the data-layer CHECKs on reservations, vehicles, payments and users
 *     (audit P3-7)
 *   - the non-negative cost and mileage CHECKs on vehicle_services (P2-5c)
 *
 * The table list is derived from schema.prisma's @@map declarations, following
 * rls-security.test.ts, so a new model is covered without editing this file.
 */
const schema = readFileSync(
  resolve(process.cwd(), "prisma", "schema.prisma"),
  "utf8"
);
const mappedTables = [...schema.matchAll(/@@map\("([^"]+)"\)/g)].map(
  ([, table]) => table
);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("database objects that schema.prisma does not model", () => {
  it("has at least the ten tables we expect to derive", () => {
    // Guards the derivation itself: a regex that silently matched nothing
    // would make every test below vacuously pass.
    expect(mappedTables.length).toBeGreaterThanOrEqual(10);
  });

  it("keeps the reservations_no_overlap exclusion constraint", async () => {
    const rows = await prisma.$queryRaw<{ contype: string }[]>`
      SELECT contype::text FROM pg_constraint
      WHERE conname = 'reservations_no_overlap'
    `;
    expect(rows).toHaveLength(1);
    // 'x' is an exclusion constraint. A plain unique or check would not stop
    // overlapping ranges.
    expect(rows[0]!.contype).toBe("x");
  });

  it("compares whole calendar days, return day included", async () => {
    // The return day is a rental day: a half-open tsrange on the stored
    // instants would let another booking pick the car up that afternoon.
    const [row] = await prisma.$queryRaw<{ def: string }[]>`
      SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
      WHERE conname = 'reservations_no_overlap'
    `;
    expect(row!.def).toContain("daterange");
    expect(row!.def).toContain("'[]'");
  });

  it("keeps the btree_gist extension the constraint depends on", async () => {
    const rows = await prisma.$queryRaw<{ extname: string }[]>`
      SELECT extname FROM pg_extension WHERE extname = 'btree_gist'
    `;
    expect(rows).toHaveLength(1);
  });

  it.each(mappedTables)(
    "has row-level security enabled on %s",
    async (table) => {
      const rows = await prisma.$queryRaw<{ relrowsecurity: boolean }[]>`
      SELECT relrowsecurity FROM pg_class
      WHERE relnamespace = 'public'::regnamespace
        AND relkind = 'r'
        AND relname = ${table}
    `;
      expect(rows).toHaveLength(1);
      expect(rows[0]!.relrowsecurity).toBe(true);
    }
  );

  it("keeps both CHECK constraints on rental_inspections", async () => {
    const rows = await prisma.$queryRaw<{ conname: string }[]>`
      SELECT conname FROM pg_constraint
      WHERE conrelid = 'rental_inspections'::regclass AND contype = 'c'
    `;
    const names = rows.map((r) => r.conname);
    expect(names).toContain("rental_inspections_fuel_level_check");
    expect(names).toContain("rental_inspections_mileage_check");
  });

  /**
   * Audit P3-7. Each is asserted by name and by a write it must refuse, so
   * a constraint recreated with a weaker expression fails here too.
   */
  it.each([
    ["reservations", "reservations_return_not_before_pickup"],
    ["reservations", "reservations_total_price_nonnegative"],
    ["reservations", "reservations_late_days_nonnegative"],
    ["reservations", "reservations_late_charge_nonnegative"],
    ["vehicles", "vehicles_price_per_day_positive"],
    ["payments", "payments_amount_positive"],
    ["users", "users_email_lowercase"],
    ["vehicle_services", "vehicle_services_cost_nonnegative"],
    ["vehicle_services", "vehicle_services_mileage_nonnegative"],
  ])("keeps the CHECK on %s named %s", async (table, name) => {
    const rows = await prisma.$queryRaw<{ conname: string }[]>`
      SELECT conname FROM pg_constraint
      WHERE conrelid = ${table}::regclass AND contype = 'c' AND conname = ${name}
    `;
    expect(rows).toHaveLength(1);
  });

  describe("the data-layer CHECKs refuse what they exist to refuse", () => {
    const suffix = Math.random().toString(36).slice(2, 10);
    const vehicleId = `chk-vehicle-${suffix}`;
    const customerId = `chk-customer-${suffix}`;
    const reservationId = `chk-res-${suffix}`;
    const userId = `chk-user-${suffix}`;

    afterAll(async () => {
      await prisma.reservation.deleteMany({ where: { vehicleId } });
      await prisma.vehicle.deleteMany({ where: { id: vehicleId } });
      await prisma.customer.deleteMany({ where: { id: customerId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    });

    const violates = (name: string) =>
      expect.objectContaining({
        message: expect.stringContaining(name),
      });

    it("on vehicles and reservations", async () => {
      await expect(
        prisma.$executeRaw`INSERT INTO vehicles (id, slug, brand, model, year, category, transmission, "fuelType", seats, "pricePerDay", description, "updatedAt")
          VALUES (${vehicleId}, ${vehicleId}, 'T', 'C', 2027, 'SEDAN', 'MANUAL', 'PETROL', 5, 0, 'check test vehicle', now())`
      ).rejects.toEqual(violates("vehicles_price_per_day_positive"));

      await prisma.vehicle.create({
        data: {
          id: vehicleId,
          slug: vehicleId,
          brand: "T",
          model: "C",
          year: 2027,
          category: "SEDAN",
          transmission: "MANUAL",
          fuelType: "PETROL",
          seats: 5,
          pricePerDay: 10,
          description: "check test vehicle",
        },
      });
      await prisma.customer.create({
        data: {
          id: customerId,
          firstName: "C",
          lastName: "T",
          email: `chk-${suffix}@example.test`,
          phone: "+383 44 000 000",
        },
      });
      const base = {
        vehicleId,
        customerId,
        pickupDate: new Date("2031-03-10T10:00:00Z"),
        returnDate: new Date("2031-03-10T10:00:00Z"),
        totalPrice: 10,
      };

      // A same-day rental is valid since rentals became inclusive.
      await prisma.reservation.create({ data: { id: reservationId, ...base } });

      await expect(
        prisma.reservation.create({
          data: { ...base, returnDate: new Date("2031-03-09T10:00:00Z") },
        })
      ).rejects.toEqual(violates("reservations_return_not_before_pickup"));
      await expect(
        prisma.reservation.create({ data: { ...base, totalPrice: -1 } })
      ).rejects.toEqual(violates("reservations_total_price_nonnegative"));
      await expect(
        prisma.reservation.update({
          where: { id: reservationId },
          data: { lateDays: -1 },
        })
      ).rejects.toEqual(violates("reservations_late_days_nonnegative"));
      await expect(
        prisma.reservation.update({
          where: { id: reservationId },
          data: { lateCharge: -5 },
        })
      ).rejects.toEqual(violates("reservations_late_charge_nonnegative"));
      await expect(
        prisma.payment.create({
          data: {
            reservationId,
            provider: "test",
            idempotencyKey: `chk-${suffix}`,
            amount: 0,
          },
        })
      ).rejects.toEqual(violates("payments_amount_positive"));
    });

    it("on users", async () => {
      await expect(
        prisma.user.create({
          data: {
            id: userId,
            name: "Check",
            email: `Mixed.Case-${suffix}@Example.test`,
            password: "x",
          },
        })
      ).rejects.toEqual(violates("users_email_lowercase"));
    });
  });
});
