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
import {
  draftFolder,
  inspectionFolder,
  vehicleFolder,
} from "@/lib/cloudinary/folders";

/**
 * The media grid submits the gallery as one ordered list, so a save is a
 * reconcile: some photos leave, some are new, the rest change position.
 * It used to do that one photo at a time, alternating Cloudinary and Postgres
 * — up to thirty-two sequential round trips to replace eight photos — with no
 * transaction, so a failure partway through left a gallery in a state no
 * single save produced.
 *
 * Cloudinary is mocked: what is under test is the ordering and the
 * transaction boundary, not the SDK. The folder rules live outside the mocked
 * module, so they are real here.
 */
const deleteImage = vi.hoisted(() => vi.fn());
const reportError = vi.hoisted(() => vi.fn());
vi.mock("@/lib/observability", () => ({
  reportError: (...args: unknown[]) => reportError(...args),
}));
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
const folder = vehicleFolder(vehicleId);
const draft = (name: string) =>
  `${draftFolder("3f1c2b8e-9a7d-4c1e-8b2a-1d2e3f4a5b6c")}/${name}`;

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
      publicId: `${folder}/${letter}`,
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
  reportError.mockReset();
  moveIntoVehicleFolder
    .mockReset()
    .mockImplementation(async (publicId: string) => ({
      publicId: `${folder}/moved`,
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
      uploaded(draft("new")),
      existing(photo("a")),
    ]);

    const rows = await gallery();
    expect(rows.map((r) => r.sortOrder)).toEqual([0, 1, 2]);
    expect(rows[0]?.id).toBe(photo("c"));
    expect(rows[2]?.id).toBe(photo("a"));
    expect(rows[1]?.publicId).toBe(`${folder}/moved`);

    // b and d left, so exactly their two assets are destroyed.
    expect(deleteImage.mock.calls.flat().sort()).toEqual([
      `${folder}/b`,
      `${folder}/d`,
    ]);
  });

  /**
   * The atomicity assertion. Something changes underneath the save — here a
   * row disappears between the ownership check and the writes, as when a
   * second tab saved first — and the whole reconcile must come to nothing
   * rather than leaving half of it applied.
   *
   * And the ordering assertion (P3-1): no asset is destroyed when the
   * database refused the change. The old order destroyed b and d's images
   * first, so this failure left d's row pointing at a deleted image.
   */
  it("applies nothing and destroys nothing when a write fails", async () => {
    // Runs after the ownership check, before the row writes.
    moveIntoVehicleFolder.mockImplementation(async () => {
      await prisma.vehicleImage.deleteMany({ where: { id: photo("b") } });
      return { publicId: `${folder}/moved`, url: "https://cdn.test/m.jpg" };
    });

    await expect(
      syncVehicleImages(vehicleId, [
        existing(photo("c")),
        existing(photo("b")),
        uploaded(draft("new")),
        existing(photo("a")),
      ])
    ).rejects.toThrow();

    const rows = await gallery();
    // d's removal rolled back with everything else, and nothing was reordered.
    expect(rows.map((r) => r.id)).toEqual([photo("a"), photo("c"), photo("d")]);
    expect(rows.map((r) => r.sortOrder)).toEqual([0, 2, 3]);
    // d's row survives, so its image must too.
    expect(deleteImage).not.toHaveBeenCalled();
    // The renamed draft has no row; it is reported, not silently lost.
    expect(reportError).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ strandedPublicIds: [`${folder}/moved`] })
    );
  });

  it("commits the gallery and reports an asset whose destroy failed", async () => {
    deleteImage.mockImplementation(async (publicId: string) => {
      if (publicId.endsWith("/d")) throw new Error("cloudinary unavailable");
    });

    // The gallery the operator asked for is what was saved, so the save
    // succeeds; the stranded asset is an operations matter, not theirs.
    await syncVehicleImages(vehicleId, [existing(photo("a"))]);

    const rows = await gallery();
    expect(rows.map((r) => r.id)).toEqual([photo("a")]);
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        scope: "sync-vehicle-images-destroy",
        strandedPublicIds: [`${folder}/d`],
      })
    );
  });

  it.each([
    ["another vehicle's folder", `${vehicleFolder("cmother12345")}/x`],
    [
      "an inspection's folder",
      `${inspectionFolder("cmres123456", "RETURN")}/x`,
    ],
  ])("refuses a signed receipt from %s", async (_, publicId) => {
    await expect(
      syncVehicleImages(vehicleId, [existing(photo("a")), uploaded(publicId)])
    ).rejects.toThrow(/does not belong to this vehicle/);

    expect((await gallery()).length).toBe(4);
    expect(deleteImage).not.toHaveBeenCalled();
  });

  it("refuses to attach one asset to two galleries", async () => {
    await expect(
      prisma.vehicleImage.create({
        data: {
          vehicleId,
          url: "https://cdn.test/dup.jpg",
          publicId: `${folder}/a`,
        },
      })
    ).rejects.toMatchObject({ code: "P2002" });
  });
});
