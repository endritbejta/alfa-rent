import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/** All app assets live under one root folder in the Cloudinary media library. */
const ROOT_FOLDER = "alfa-rent-a-car";

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
 * — only the derived signature is handed out, and it covers `folder` and
 * `transformation`, so a caller cannot retarget the upload or skip the
 * resize by editing the request.
 */
export type UploadSignature = {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  folder: string;
  transformation: string;
};

/** cuid (vehicle ids) or uuid (draft ids) — anything else could escape the folder. */
const SAFE_ID = /^[a-z0-9-]{8,64}$/i;

function assertSafeId(id: string): string {
  if (!SAFE_ID.test(id)) throw new Error("Unsafe upload folder segment");
  return id;
}

/**
 * A vehicle's assets live together so they can be browsed and cleaned up as
 * a unit. A vehicle being created has no id yet, so its uploads land in a
 * draft folder and are renamed into place once the row exists.
 */
export function vehicleFolder(vehicleId: string): string {
  return `${ROOT_FOLDER}/vehicles/${assertSafeId(vehicleId)}`;
}

export function draftFolder(draftId: string): string {
  return `${ROOT_FOLDER}/vehicles/_drafts/${assertSafeId(draftId)}`;
}

export function signUpload(folder: string): UploadSignature {
  const timestamp = Math.round(Date.now() / 1000);
  const signature = cloudinary.utils.api_sign_request(
    { timestamp, folder, transformation: INCOMING_TRANSFORMATION },
    process.env.CLOUDINARY_API_SECRET!
  );

  return {
    signature,
    timestamp,
    apiKey: process.env.CLOUDINARY_API_KEY!,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME!,
    folder,
    transformation: INCOMING_TRANSFORMATION,
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
  return expected === asset.signature;
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
