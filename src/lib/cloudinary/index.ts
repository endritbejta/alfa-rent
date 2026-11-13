import { timingSafeEqual } from "node:crypto";
import { v2 as cloudinary } from "cloudinary";
import { vehicleFolder } from "./folders";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  /*
   * The SDK defaults to roughly a minute. A gallery save can make several
   * renames and destroys, and they run inside a Vercel function with its own
   * ceiling — so one unresponsive call could burn the whole budget and get the
   * function killed partway through, which is precisely the partial write the
   * ordering in vehicle.service and image.service is arranged to avoid.
   * Failing a single call quickly leaves a retryable state instead.
   */
  timeout: 15_000,
});

/**
 * Applied at upload time so Cloudinary stores the normalized asset rather
 * than the 12 MP original. Signed, so the browser cannot widen it.
 */
const INCOMING_TRANSFORMATION = "c_limit,h_1080,w_1920";

export type UploadedImage = {
  url: string;
  publicId: string;
};

/**
 * Params the browser needs to POST a file straight to Cloudinary.
 *
 * The file never passes through a Vercel function: that path is capped at a
 * 4.5 MB request body platform-wide, which two phone photos exceed, and it
 * buffered every upload in function memory. `api_secret` stays on the server
 * — only the derived signature is handed out, and it covers `folder`,
 * `transformation` and `allowed_formats`, so a caller cannot retarget the
 * upload, skip the resize or upload a non-image by editing the request.
 */
export type UploadSignature = {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  folder: string;
  transformation: string;
  allowedFormats: string;
};

export {
  draftFolder,
  inspectionFolder,
  isDraftUpload,
  isVehicleGalleryUpload,
  vehicleFolder,
} from "./folders";

/**
 * The formats the upload widgets accept (media-grid, inspection uploads),
 * signed into every upload so a caller holding a signature cannot use it to
 * store something else — an SVG with script in it, a PDF, a video — in our
 * account. The browser-side `accept` lists are a convenience; this is the
 * check. Formats are the extensions Cloudinary detects, not MIME types.
 */
export const ALLOWED_UPLOAD_FORMATS = "jpg,jpeg,png,webp,avif";

export function signUpload(folder: string): UploadSignature {
  const timestamp = Math.round(Date.now() / 1000);
  const signature = cloudinary.utils.api_sign_request(
    {
      timestamp,
      folder,
      transformation: INCOMING_TRANSFORMATION,
      allowed_formats: ALLOWED_UPLOAD_FORMATS,
    },
    process.env.CLOUDINARY_API_SECRET!
  );

  return {
    signature,
    timestamp,
    apiKey: process.env.CLOUDINARY_API_KEY!,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME!,
    folder,
    transformation: INCOMING_TRANSFORMATION,
    allowedFormats: ALLOWED_UPLOAD_FORMATS,
  };
}

/**
 * Proves an asset was really created by Cloudinary under our account.
 *
 * With direct uploads the browser reports what to save, so the reported
 * publicId is untrusted input — without this check a caller could point a
 * vehicle at any URL they liked. Cloudinary signs each upload response over
 * (public_id, version) with our secret, so re-deriving it here is proof
 * without an extra round trip.
 */
export function verifyUploadSignature(asset: {
  publicId: string;
  version: number;
  signature: string;
}): boolean {
  const expected = cloudinary.utils.api_sign_request(
    { public_id: asset.publicId, version: asset.version },
    process.env.CLOUDINARY_API_SECRET!
  );
  return constantTimeEqual(expected, asset.signature);
}

/**
 * `===` returns at the first differing character, so the time it takes leaks
 * how much of a guessed signature was right. timingSafeEqual does not, but it
 * throws on buffers of different lengths — and the length of a SHA-1 hex
 * digest is public anyway, so checking it first gives nothing away.
 */
function constantTimeEqual(expected: string, actual: string): boolean {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(actual, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Built from the verified publicId — never from a client-supplied URL. */
export function buildImageUrl(publicId: string, version: number): string {
  return cloudinary.url(publicId, { version, secure: true });
}

/** Moves a draft upload into the vehicle's folder once the vehicle exists. */
export async function moveIntoVehicleFolder(
  publicId: string,
  vehicleId: string
): Promise<UploadedImage> {
  const filename = publicId.split("/").pop()!;
  const result = await cloudinary.uploader.rename(
    publicId,
    `${vehicleFolder(vehicleId)}/${filename}`
  );
  return { url: result.secure_url, publicId: result.public_id };
}

export async function deleteImage(publicId: string): Promise<void> {
  await cloudinary.uploader.destroy(publicId);
}
