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
