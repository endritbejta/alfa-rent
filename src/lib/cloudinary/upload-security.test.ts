import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  draftFolder,
  inspectionFolder,
  isDraftUpload,
  isVehicleGalleryUpload,
  vehicleFolder,
} from "@/lib/cloudinary/folders";

/**
 * The checks that stand between a browser-reported upload receipt and a row
 * in our database (audit finding P3-1). The SDK is real here — only the
 * secret is a test value — because a signature check that passes against a
 * mock proves nothing about what Cloudinary sends.
 */
const SECRET = "test-api-secret";

let cloudinaryModule: typeof import("@/lib/cloudinary");
beforeAll(async () => {
  vi.stubEnv("CLOUDINARY_API_SECRET", SECRET);
  vi.stubEnv("CLOUDINARY_API_KEY", "123");
  vi.stubEnv("CLOUDINARY_CLOUD_NAME", "demo");
  cloudinaryModule = await import("@/lib/cloudinary");
});

/** Cloudinary's documented scheme: sha1 of the sorted params, then the secret. */
function cloudinarySigns(params: Record<string, string | number>): string {
  const payload = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return createHash("sha1")
    .update(payload + SECRET)
    .digest("hex");
}

const VEHICLE = "cmabc123vehicle";
const OTHER_VEHICLE = "cmzzz999vehicle";
const DRAFT = "3f1c2b8e-9a7d-4c1e-8b2a-1d2e3f4a5b6c";

describe("which receipts may join a vehicle's gallery", () => {
  it("accepts a file directly in the vehicle's own folder", () => {
    expect(
      isVehicleGalleryUpload(`${vehicleFolder(VEHICLE)}/photo1`, VEHICLE)
    ).toBe(true);
  });

  it("accepts a file directly in a draft folder", () => {
    expect(
      isVehicleGalleryUpload(`${draftFolder(DRAFT)}/photo1`, VEHICLE)
    ).toBe(true);
    expect(isDraftUpload(`${draftFolder(DRAFT)}/photo1`)).toBe(true);
    expect(isDraftUpload(`${vehicleFolder(VEHICLE)}/photo1`)).toBe(false);
  });

  it.each([
    ["another vehicle's folder", `${vehicleFolder(OTHER_VEHICLE)}/photo1`],
    [
      "an inspection's folder",
      `${inspectionFolder("cmres12345", "PICKUP")}/photo1`,
    ],
    ["a nested path", `${vehicleFolder(VEHICLE)}/sub/photo1`],
    ["the folder itself", `${vehicleFolder(VEHICLE)}/`],
    ["a parent reference", `${vehicleFolder(VEHICLE)}/..`],
    ["the draft root", "alfa-rent-a-car/vehicles/_drafts/photo1"],
    ["a nested draft path", `${draftFolder(DRAFT)}/x/photo1`],
    ["an unsafe draft id", "alfa-rent-a-car/vehicles/_drafts/a.b/photo1"],
    ["a prefix collision", `${vehicleFolder(VEHICLE)}-evil/photo1`],
    ["outside the app root", `elsewhere/vehicles/${VEHICLE}/photo1`],
  ])("rejects %s", (_, publicId) => {
    expect(isVehicleGalleryUpload(publicId, VEHICLE)).toBe(false);
  });
});

describe("verifyUploadSignature", () => {
  const asset = { publicId: `${vehicleFolder(VEHICLE)}/photo1`, version: 42 };

  it("accepts the signature Cloudinary returns", () => {
    const signature = cloudinarySigns({
      public_id: asset.publicId,
      version: asset.version,
    });
    expect(
      cloudinaryModule.verifyUploadSignature({ ...asset, signature })
    ).toBe(true);
  });

  it("rejects a signature for a different asset", () => {
    const signature = cloudinarySigns({
      public_id: `${vehicleFolder(OTHER_VEHICLE)}/photo1`,
      version: asset.version,
    });
    expect(
      cloudinaryModule.verifyUploadSignature({ ...asset, signature })
    ).toBe(false);
  });

  // timingSafeEqual throws on unequal lengths; a throw here would surface as
  // a 500 instead of a clean "could not be verified".
  it.each([
    ["empty", ""],
    ["truncated", "abc123"],
    ["too long", "a".repeat(200)],
    ["multi-byte", "é".repeat(20)],
  ])("rejects a %s signature without throwing", (_, signature) => {
    expect(
      cloudinaryModule.verifyUploadSignature({ ...asset, signature })
    ).toBe(false);
  });
});

describe("signUpload", () => {
  it("signs allowed_formats alongside the folder and transformation", () => {
    const signed = cloudinaryModule.signUpload(vehicleFolder(VEHICLE));
    expect(signed.allowedFormats).toBe("jpg,jpeg,png,webp,avif");
    // Exactly the params the browser posts, so Cloudinary's own check of the
    // request matches — and a caller who drops or widens the format list
    // invalidates the signature.
    expect(signed.signature).toBe(
      cloudinarySigns({
        allowed_formats: signed.allowedFormats,
        folder: signed.folder,
        timestamp: signed.timestamp,
        transformation: signed.transformation,
      })
    );
  });
});
