import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Production reaches Postgres through a pooler with Prisma at
 * connection_limit=1 (see lib/db/prisma). Inside an interactive transaction
 * that one connection belongs to the transaction, so any query a service
 * makes on the *global* client while the transaction is open waits for a
 * connection that only comes back when the transaction ends — which it does
 * by timing out after 8 s. Locally the pool is larger, so the same code
 * passes every other test.
 *
 * That is how changing a car's status on the edit page failed in production
 * with "An unexpected error occurred": the status check counted reservations
 * through `prisma` instead of `tx`. This file runs the service the way
 * production does, on one connection.
 */
vi.hoisted(() => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  url.searchParams.set("connection_limit", "1");
  // Fail in seconds rather than at the transaction's own 8 s timeout.
  url.searchParams.set("pool_timeout", "3");
  process.env.DATABASE_URL = url.toString();
});

const { prisma } = await import("@/lib/db/prisma");
const { updateVehicle } = await import("@/services/vehicle.service");
const { createTestActor, removeTestActor } =
  await import("@/lib/testing/audit");

const suffix = randomUUID().slice(0, 8);
const vehicleId = `one-conn-${suffix}`;
let actor = "";

beforeAll(async () => {
  actor = await createTestActor(`one-conn-${suffix}`);
  await prisma.vehicle.create({
    data: {
      id: vehicleId,
      slug: vehicleId,
      brand: "Test",
      model: "OneConnection",
      year: 2027,
      category: "VAN",
      transmission: "MANUAL",
      fuelType: "DIESEL",
      seats: 9,
      pricePerDay: 60,
      description: "Integration-test vehicle for the single-connection pool.",
    },
  });
});

afterAll(async () => {
  await prisma.vehicle.deleteMany({ where: { id: vehicleId } });
  await removeTestActor(actor);
  await prisma.$disconnect();
});

describe("on a single database connection, as in production", () => {
  it("really is limited to one connection", () => {
    expect(
      new URL(process.env.DATABASE_URL ?? "").searchParams.get(
        "connection_limit"
      )
    ).toBe("1");
  });

  it("changes a car's status without waiting on its own transaction", async () => {
    const started = Date.now();
    await updateVehicle(vehicleId, { status: "SERVICE" }, actor);
    expect(Date.now() - started).toBeLessThan(3_000);

    const row = await prisma.vehicle.findUniqueOrThrow({
      where: { id: vehicleId },
      select: { status: true },
    });
    expect(row.status).toBe("SERVICE");

    // And back: the other branch of the same check.
    await updateVehicle(vehicleId, { status: "AVAILABLE" }, actor);
    expect(
      (
        await prisma.vehicle.findUniqueOrThrow({
          where: { id: vehicleId },
          select: { status: true },
        })
      ).status
    ).toBe("AVAILABLE");
  }, 20_000);
});
