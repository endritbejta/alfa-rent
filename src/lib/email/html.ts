/**
 * What every HTML email here shares: escaping and the inlined palette. Mail
 * clients ignore stylesheets, so the colours travel as constants.
 */

import { cloudinaryJpegCrop } from "@/lib/cloudinary/image-loader";

/** Customer-typed text goes into HTML; none of it may become markup. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** The app's palette, inlined. */
export const EMAIL_COLORS = {
  page: "#f4f2f1",
  card: "#ffffff",
  ink: "#161414",
  muted: "#5b5655",
  line: "#e7e3e2",
  soft: "#f7f5f4",
  brand: "#dc2028",
  pendingInk: "#92400e",
  pendingBg: "#fef3c7",
  confirmedInk: "#166534",
  confirmedBg: "#dcfce7",
  cancelledInk: "#991b1b",
  cancelledBg: "#fee2e2",
  photo: "#1e1c1c",
} as const;

export const EMAIL_FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/**
 * The email header photo: 2:1, at twice the 560px column for high-density
 * screens, so a tall phone photo cannot push the booking below the fold.
 */
export function emailCarPhotoUrl(src: string | null): string | null {
  return cloudinaryJpegCrop(src, 1120, 560);
}
