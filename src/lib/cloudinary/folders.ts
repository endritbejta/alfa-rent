/**
 * Where uploads live in the Cloudinary media library, and which receipts may
 * be attached where.
 *
 * Kept apart from the SDK wrapper in ./index so the checks are plain string
 * logic: the services that enforce them can be tested with Cloudinary mocked
 * out without the folder rules disappearing along with it.
 */

/** All app assets live under one root folder in the Cloudinary media library. */
const ROOT_FOLDER = "alfa-rent-a-car";

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

const DRAFTS_FOLDER = `${ROOT_FOLDER}/vehicles/_drafts`;

export function draftFolder(draftId: string): string {
  return `${DRAFTS_FOLDER}/${assertSafeId(draftId)}`;
}

export function inspectionFolder(
  reservationId: string,
  type: "PICKUP" | "RETURN"
): string {
  return `${ROOT_FOLDER}/inspections/${assertSafeId(reservationId)}/${type.toLowerCase()}`;
}

/** A file name directly inside a folder: no further path, nothing to climb. */
const LEAF = /^[^/]+$/;

function isLeafOf(publicId: string, folder: string): boolean {
  if (!publicId.startsWith(`${folder}/`)) return false;
  const leaf = publicId.slice(folder.length + 1);
  return LEAF.test(leaf) && leaf !== "." && leaf !== "..";
}

/**
 * Whether a verified upload receipt may join this vehicle's gallery.
 *
 * The signature only proves Cloudinary issued the asset to our account — not
 * that it was uploaded for this vehicle. Without this check a receipt from
 * another vehicle's folder, or from an inspection, could be attached here,
 * and removing it later would destroy an image something else still shows.
 *
 * Draft folders are accepted for any draft id: the id is generated in the
 * browser before the vehicle exists, so the server has nothing to match it
 * against. A draft asset is renamed into this vehicle's folder on save, so it
 * can be claimed once.
 */
export function isVehicleGalleryUpload(
  publicId: string,
  vehicleId: string
): boolean {
  if (isLeafOf(publicId, vehicleFolder(vehicleId))) return true;
  if (!publicId.startsWith(`${DRAFTS_FOLDER}/`)) return false;
  const [draftId, ...rest] = publicId
    .slice(DRAFTS_FOLDER.length + 1)
    .split("/");
  return (
    draftId !== undefined &&
    SAFE_ID.test(draftId) &&
    rest.length === 1 &&
    isLeafOf(publicId, `${DRAFTS_FOLDER}/${draftId}`)
  );
}

/** Whether the receipt sits in a draft folder and must be moved on save. */
export function isDraftUpload(publicId: string): boolean {
  return publicId.startsWith(`${DRAFTS_FOLDER}/`);
}
