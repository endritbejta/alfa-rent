import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { deleteVehicle } from "@/services/vehicle.service";

/**
 * Deleting a vehicle used to destroy every Cloudinary asset first and only
 * then delete the row — and that delete can fail, because
 * Reservation.vehicleId is onDelete: Restrict. A booking landing between the
 * checks and the delete meant the operator saw an error, the vehicle was still
 * there, and its entire gallery was permanently gone.
 *
 * Cloudinary is mocked here: the point is the ordering and the transaction
 * boundary, not that the SDK works. What matters is that a refused delete
 * destroys nothing.
 */
const deleteImage = vi.hoisted(() => vi.fn());
vi.mock("@/lib/cloudinary", () => ({
  deleteImage: (publicId: string) => deleteImage(publicId),
}));

const suffix = randomUUID().slice(0, 8);
const ids = {
  customer: `del-customer-${suffix}`,
  blocked: `del-blocked-${suffix}`,
  deletable: `del-ok-${suffix}`,
  retiring: `del-history-${suffix}`,
};

const base = {
  brand: "Test",
  model: "Delete",
  year: 2027,
  category: "SEDAN" as const,
  transmission: "AUTOMATIC" as const,
  fuelType: "PETROL" as const,
  seats: 5,
  pricePerDay: 30,
  description: "Integration-test vehicle for delete ordering.",
};

const imagesFor = (vehicleId: string) => ({
  create: [
    {
      url: "https://example.test/a.jpg",
      publicId: `${vehicleId}/a`,
      sortOrder: 0,
    },
    {
      url: "https://example.test/b.jpg",
      publicId: `${vehicleId}/b`,
      sortOrder: 1,
    },
  ],
});

beforeAll(async () => {
  deleteImage.mockResolvedValue(undefined);

  await prisma.customer.create({
    data: {
      id: ids.customer,
      firstName: "Del",
      lastName: "Tester",
      email: `del-${suffix}@example.test`,
      phone: "-",
    },
  });

  for (const [id, slug] of [
    [ids.blocked, `del-blocked-${suffix}`],
    [ids.deletable, `del-ok-${suffix}`],
    [ids.retiring, `del-history-${suffix}`],
  ] as const) {
    await prisma.vehicle.create({
      data: { id, slug, ...base, images: imagesFor(id) },
    });
  }

  // An open reservation makes the delete illegal.
  await prisma.reservation.create({
    data: {
      vehicleId: ids.blocked,
      customerId: ids.customer,
      pickupDate: new Date("2027-11-01T10:00:00.000Z"),
      returnDate: new Date("2027-11-04T10:00:00.000Z"),
      status: "CONFIRMED",
      totalPrice: 90,
    },
  });

  // Settled history means soft-retire rather than delete.
  await prisma.reservation.create({
    data: {
      vehicleId: ids.retiring,
      customerId: ids.customer,
      pickupDate: new Date("2025-02-01T10:00:00.000Z"),
      returnDate: new Date("2025-02-04T10:00:00.000Z"),
      status: "COMPLETED",
      totalPrice: 90,
    },
  });
});

afterAll(async () => {
  await prisma.reservation.deleteMany({ where: { customerId: ids.customer } });
  await prisma.vehicle.deleteMany({
    where: { id: { in: [ids.blocked, ids.deletable, ids.retiring] } },
  });
  await prisma.customer.deleteMany({ where: { id: ids.customer } });
  await prisma.$disconnect();
});

describe("deleting a vehicle", () => {
  it("destroys nothing when the delete is refused", async () => {
    deleteImage.mockClear();

    await expect(deleteVehicle(ids.blocked)).rejects.toThrow(
      /open reservations/i
    );

    // The critical assertion: no Cloudinary call was made at all.
    expect(deleteImage).not.toHaveBeenCalled();

    // And the gallery is intact.
    const survivor = await prisma.vehicle.findUniqueOrThrow({
      where: { id: ids.blocked },
      include: { images: true },
    });
    expect(survivor.images).toHaveLength(2);
  });

  it("soft-retires a vehicle with settled history, keeping its photos", async () => {
    deleteImage.mockClear();

    await deleteVehicle(ids.retiring);

    const retired = await prisma.vehicle.findUniqueOrThrow({
      where: { id: ids.retiring },
      include: { images: true },
    });
    expect(retired.status).toBe("INACTIVE");
    expect(retired.images).toHaveLength(2);
    expect(deleteImage).not.toHaveBeenCalled();
  });

  /**
   * The ordering assertion, and the one that actually fails against the old
   * code. The advisory reservation count catches an *ordinary* refusal before
   * Cloudinary is reached, so a test that only checks "nothing was destroyed"
   * passes either way. What distinguishes the two is whether the row still
   * exists at the moment an asset is destroyed: if it does, a later failed
   * delete loses photos something still points at.
   */
  it("has already removed the row by the time it destroys an asset", async () => {
    deleteImage.mockClear();
    const rowStillPresent: boolean[] = [];
    deleteImage.mockImplementation(async () => {
      const row = await prisma.vehicle.findUnique({
        where: { id: ids.deletable },
      });
      rowStillPresent.push(row !== null);
    });

    await deleteVehicle(ids.deletable);

    expect(deleteImage).toHaveBeenCalledTimes(2);
    // Never destroy an asset that a live row still references.
    expect(rowStillPresent).toEqual([false, false]);

    expect(
      await prisma.vehicle.findUnique({ where: { id: ids.deletable } })
    ).toBeNull();
    expect(
      await prisma.vehicleImage.count({ where: { vehicleId: ids.deletable } })
    ).toBe(0);
    expect(deleteImage.mock.calls.flat().sort()).toEqual([
      `${ids.deletable}/a`,
      `${ids.deletable}/b`,
    ]);

    deleteImage.mockResolvedValue(undefined);
  });

  it("still reports success when Cloudinary fails after the row is gone", async () => {
    // The vehicle is already deleted at that point, so telling the operator
    // the delete failed would be wrong. A stranded asset is reported instead.
    const id = `del-strand-${suffix}`;
    await prisma.vehicle.create({
      data: { id, slug: id, ...base, images: imagesFor(id) },
    });

    deleteImage.mockClear();
    deleteImage.mockRejectedValue(new Error("cloudinary unavailable"));

    await expect(deleteVehicle(id)).resolves.toBeUndefined();
    expect(await prisma.vehicle.findUnique({ where: { id } })).toBeNull();

    deleteImage.mockResolvedValue(undefined);
  });
});
