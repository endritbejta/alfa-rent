import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

/**
 * The rows the end-to-end smoke test needs, made fresh for every run.
 *
 * Every name carries a per-run suffix, so a run never collides with an
 * earlier one, with the demo seed, or with the integration tests, and the
 * public-booking caps (open requests per contact, per car per day) start
 * from zero. The staff password is random, generated here, and lives only
 * in this process's memory; it is never written to disk or read from .env.
 */
export type SmokeData = {
  suffix: string;
  vehicle: { id: string; slug: string; label: string };
  admin: { id: string; email: string; password: string };
  customer: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  };
};

export const SMOKE_DATA_ENV = "E2E_SMOKE_DATA";

const LOCAL_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "host.docker.internal",
  "postgres",
]);

/**
 * Same rule as vitest.integration.setup.ts: this writes and deletes rows, so
 * it refuses anything but a local database.
 */
export function assertLocalDatabase(url = process.env.DATABASE_URL): void {
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Point it at a local, migrated database " +
        "(npm run db:setup) before running npm run test:e2e."
    );
  }
  const host = new URL(url).hostname;
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `Refusing to seed end-to-end data into "${host}": the smoke test ` +
        `writes rows. Use a local database.`
    );
  }
}

export async function seedSmokeData(): Promise<SmokeData> {
  assertLocalDatabase();
  const prisma = new PrismaClient();
  const suffix = randomUUID().slice(0, 8);
  const password = randomBytes(18).toString("base64url");
  try {
    const vehicle = await prisma.vehicle.create({
      data: {
        slug: `e2e-smoke-${suffix}`,
        brand: "Smoketest",
        model: `Run ${suffix}`,
        plate: `E2E-${suffix}`,
        year: 2024,
        category: "COMPACT",
        transmission: "MANUAL",
        fuelType: "PETROL",
        seats: 5,
        pricePerDay: "40.00",
        description: "Created by the end-to-end smoke test.",
        status: "AVAILABLE",
      },
      select: { id: true, slug: true, brand: true, model: true },
    });
    const admin = await prisma.user.create({
      data: {
        name: `E2E Admin ${suffix}`,
        email: `e2e-admin-${suffix}@e2e.test`,
        password: await bcrypt.hash(password, 10),
        role: "ADMIN",
        active: true,
        mustChangePassword: false,
      },
      select: { id: true, email: true },
    });
    return {
      suffix,
      vehicle: {
        id: vehicle.id,
        slug: vehicle.slug,
        label: `${vehicle.brand} ${vehicle.model}`,
      },
      admin: { id: admin.id, email: admin.email, password },
      customer: {
        firstName: "Arta",
        lastName: `Smoke ${suffix}`,
        email: `e2e-customer-${suffix}@e2e.test`,
        // Unique per run: the public-booking cap counts open requests per
        // normalised phone across the whole database.
        phone: `+383 44 ${String(randomInt(0, 1_000_000)).padStart(6, "0")}`,
      },
    };
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Removes what a run created, in foreign-key order. Best effort: a failure
 * here leaves suffixed rows in a local database, which is untidy but never
 * wrong, so it warns instead of failing a run that passed.
 */
export async function removeSmokeData(data: SmokeData): Promise<void> {
  assertLocalDatabase();
  const prisma = new PrismaClient();
  try {
    const reservations = await prisma.reservation.findMany({
      where: { vehicleId: data.vehicle.id },
      select: { id: true, customerId: true },
    });
    const reservationIds = reservations.map((r) => r.id);
    const customerIds = [...new Set(reservations.map((r) => r.customerId))];
    const entityIds = [
      ...reservationIds,
      ...customerIds,
      data.vehicle.id,
      data.admin.id,
    ];
    // audit_events is append-only by trigger; disabling it for one
    // transaction is the deliberate step src/lib/testing/audit.ts takes too.
    await prisma.$transaction([
      prisma.$executeRaw`ALTER TABLE audit_events DISABLE TRIGGER audit_events_append_only`,
      prisma.auditEvent.deleteMany({
        where: {
          OR: [{ actorId: data.admin.id }, { entityId: { in: entityIds } }],
        },
      }),
      prisma.$executeRaw`ALTER TABLE audit_events ENABLE TRIGGER audit_events_append_only`,
    ]);
    // Inspections and their photos cascade with the reservation.
    await prisma.reservation.deleteMany({
      where: { id: { in: reservationIds } },
    });
    await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });
    await prisma.vehicle.deleteMany({ where: { id: data.vehicle.id } });
    await prisma.user.deleteMany({ where: { id: data.admin.id } });
  } catch (error) {
    console.warn(
      `e2e: could not remove smoke data for run ${data.suffix}:`,
      error
    );
  } finally {
    await prisma.$disconnect();
  }
}

/** Reads the data globalSetup handed to the test workers. */
export function smokeData(): SmokeData {
  const raw = process.env[SMOKE_DATA_ENV];
  if (!raw) throw new Error("e2e: global setup did not run");
  return JSON.parse(raw) as SmokeData;
}
