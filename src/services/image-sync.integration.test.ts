import { randomUUID } from "node:crypto";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { prisma } from "@/lib/db/prisma";
import { syncVehicleImages } from "@/services/image.service";
import type { VehicleImageItem } from "@/lib/validations/image";

/**
 * The media grid submits the gallery as one ordered list, so a save is a
 * reconcile: some photos leave, some are new, the rest change position.
 * It used to do that one photo at a time, alternating Cloudinary and Postgres
 * — up to thirty-two sequential round trips to replace eight photos — with no
 * transaction, so a failure partway through left a gallery in a state no
 * single save produced.
 *
 * Cloudinary is mocked: what is under test is the ordering and the
 * transaction boundary, not the SDK.
 */
const deleteImage = vi.hoisted(() => vi.fn());
const moveIntoVehicleFolder = vi.hoisted(() => vi.fn());
vi.mock("@/lib/cloudinary", () => ({
  deleteImage: (publicId: string) => deleteImage(publicId),
  moveIntoVehicleFolder: (publicId: string, vehicleId: string) =>
    moveIntoVehicleFolder(publicId, vehicleId),
  buildImageUrl: (publicId: string, version: number) =>
    `https://cdn.test/${version}/${publicId}.jpg`,
  verifyUploadSignature: () => true,
}));

const suffix = randomUUID().slice(0, 8);
const vehicleId = `img-vehicle-${suffix}`;
const photo = (letter: string) => `${vehicleId}-${letter}`;

const base = {
  brand: "Test",
  model: "Gallery",
  year: 2027,
  category: "SEDAN" as const,
  transmission: "AUTOMATIC" as const,
  fuelType: "PETROL" as const,
  seats: 5,
  pricePerDay: 30,
  description: "Integration-test vehicle for gallery reconciliation.",
};

const existing = (id: string): VehicleImageItem => ({ kind: "existing", id });
const uploaded = (publicId: string): VehicleImageItem => ({
  kind: "uploaded",
  publicId,
  version: 1,
  signature: "signature",
});

async function resetGallery() {
  await prisma.vehicleImage.deleteMany({ where: { vehicleId } });
  await prisma.vehicleImage.createMany({
    data: ["a", "b", "c", "d"].map((letter, sortOrder) => ({
      id: photo(letter),
      vehicleId,
      url: `https://cdn.test/${letter}.jpg`,
      publicId: `${vehicleId}/${letter}`,
      sortOrder,
    })),
  });
}

const gallery = () =>
  prisma.vehicleImage.findMany({
    where: { vehicleId },
    orderBy: { sortOrder: "asc" },
    select: { id: true, sortOrder: true, publicId: true },
  });

beforeAll(async () => {
  await prisma.vehicle.create({
    data: { id: vehicleId, slug: vehicleId, ...base },
  });
});

beforeEach(async () => {
  deleteImage.mockReset().mockResolvedValue(undefined);
  moveIntoVehicleFolder
    .mockReset()
    .mockImplementation(async (publicId: string) => ({
      publicId: `${vehicleId}/moved`,
      url: `https://cdn.test/moved-${publicId.split("/").pop()}.jpg`,
    }));
  await resetGallery();
});

afterAll(async () => {
  await prisma.vehicle.deleteMany({ where: { id: vehicleId } });
  await prisma.$disconnect();
});

describe("reconciling a vehicle gallery", () => {
  it("removes, reorders and adds in one pass", async () => {
    await syncVehicleImages(vehicleId, [
      existing(photo("c")),
      uploaded(`${vehicleId}/_drafts/new`),
      existing(photo("a")),
    ]);

    const rows = await gallery();
    expect(rows.map((r) => r.sortOrder)).toEqual([0, 1, 2]);
    expect(rows[0]?.id).toBe(photo("c"));
    expect(rows[2]?.id).toBe(photo("a"));
    expect(rows[1]?.publicId).toBe(`${vehicleId}/moved`);

    // b and d left, so exactly their two assets are destroyed.
    expect(deleteImage.mock.calls.flat().sort()).toEqual([
      `${vehicleId}/b`,
      `${vehicleId}/d`,
    ]);
  });

  /**
   * The atomicity assertion, and the one that fails against the old code.
   * Something changes underneath the save — here a row disappears between the
   * ownership check and the writes — and the whole reconcile must come to
   * nothing rather than leaving half of it applied.
   */
  it("applies nothing at all when a write fails partway", async () => {
    // Runs after the ownership check, before the row writes.
    deleteImage.mockImplementation(async () => {
      await prisma.vehicleImage.deleteMany({ where: { id: photo("b") } });
    });

    await expect(
      syncVehicleImages(vehicleId, [
        existing(photo("c")),
        existing(photo("b")),
        existing(photo("a")),
      ])
    ).rejects.toThrow();

    const rows = await gallery();
    // d's removal rolled back with everything else, and nothing was reordered.
    expect(rows.map((r) => r.id)).toEqual([photo("a"), photo("c"), photo("d")]);
    expect(rows.map((r) => r.sortOrder)).toEqual([0, 2, 3]);
  });

  it("still clears the rows whose assets are already gone", async () => {
    deleteImage.mockImplementation(async (publicId: string) => {
      if (publicId.endsWith("/d")) throw new Error("cloudinary unavailable");
    });

    await expect(
      syncVehicleImages(vehicleId, [existing(photo("a"))])
    ).rejects.toThrow(/could not be removed/i);

    const rows = await gallery();
    // b and c are gone with their assets; d kept its row, so a retry finishes.
    expect(rows.map((r) => r.id).sort()).toEqual([photo("a"), photo("d")]);
  });
});
