/**
 * next/image, served by Cloudinary's own transforms.
 *
 * Every upload is already normalised to 1920x1080 by a signed transformation
 * at upload time, and Cloudinary will resize and re-encode from there for
 * free through the URL. Without this loader Vercel's optimizer fetched each
 * of those assets and processed them a second time, billing optimisation
 * units for work that had already been done.
 *
 * This runs in the browser as well as on the server, so it is deliberately
 * nothing but string work — no SDK, no environment variables. The cloud name
 * comes from the URL the service already built.
 *
 * Anything that is not a Cloudinary delivery URL is returned untouched: the
 * brand logo is a local file, and the upload previews are blob: URLs (those
 * pass `unoptimized` and never reach here at all).
 */
const DELIVERY_HOST = "https://res.cloudinary.com/";
const UPLOAD_SEGMENT = "/image/upload/";

export default function cloudinaryLoader({
  src,
  width,
  quality,
}: {
  src: string;
  width: number;
  quality?: number;
}): string {
  if (!src.startsWith(DELIVERY_HOST)) return src;
  const at = src.indexOf(UPLOAD_SEGMENT);
  if (at === -1) return src;

  const cut = at + UPLOAD_SEGMENT.length;
  const transforms = [
    // Let Cloudinary negotiate the format — AVIF and WebP where accepted.
    "f_auto",
    `q_${quality ?? "auto"}`,
    // c_limit never upscales, so a 400px thumbnail of a 1920px original is
    // 400px and a 3000px request is still only 1920.
    "c_limit",
    `w_${width}`,
  ].join(",");

  return `${src.slice(0, cut)}${transforms}/${src.slice(cut)}`;
}

/**
 * A fixed-size JPEG crop of a Cloudinary photo, for places that cannot
 * negotiate formats or sizes the way a browser does: link previews (Open
 * Graph) and email. The crop is pinned so a tall phone photo still fills the
 * frame, and JPEG because several mail clients and preview scrapers cannot
 * show WebP or AVIF. Returns null for anything that is not a Cloudinary
 * delivery URL.
 */
export function cloudinaryJpegCrop(
  src: string | null | undefined,
  width: number,
  height: number
): string | null {
  if (!src?.startsWith(DELIVERY_HOST)) return null;
  const at = src.indexOf(UPLOAD_SEGMENT);
  if (at === -1) return null;
  const cut = at + UPLOAD_SEGMENT.length;
  return `${src.slice(0, cut)}c_fill,g_auto,w_${width},h_${height},q_auto,f_jpg/${src.slice(cut)}`;
}
