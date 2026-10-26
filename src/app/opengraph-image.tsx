import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { DEFAULT_LOCALE } from "@/lib/i18n/config";
import { dictionaries } from "@/lib/i18n/translations";

/**
 * The link preview for every page without its own image (home, fleet,
 * contact, and cars with no photo yet) when shared on WhatsApp, Facebook or
 * Viber. Rendered once at build time, in the site's default language, from
 * the same tagline the home page uses.
 *
 * Uses the renderer's bundled Geist, the site's own typeface. Only its
 * regular weight ships with Next, so hierarchy comes from size, not weight.
 */
const tagline = dictionaries[DEFAULT_LOCALE]["home.metaTitle"];

export const alt = `Alfa Rent a Car — ${tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const logo = await readFile(
    join(process.cwd(), "public/brand/alfa-logo-red.png")
  );
  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "76px 84px",
        background:
          "radial-gradient(circle at 88% 12%, #4a1518 0%, #1e1c1c 48%, #161414 100%)",
        color: "#f1efee",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
        <img src={logoSrc} width={64} height={63} alt="" />
        <div style={{ display: "flex", fontSize: 46, letterSpacing: 6 }}>
          ALFA
          <span style={{ color: "#e8535c", marginLeft: 16 }}>RENT</span>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 30 }}>
        <div
          style={{
            fontSize: 88,
            lineHeight: 1.04,
            letterSpacing: -2,
            maxWidth: 980,
          }}
        >
          {tagline}
        </div>
        <div
          style={{
            width: 140,
            height: 10,
            borderRadius: 5,
            background: "#dc2028",
          }}
        />
      </div>
    </div>,
    size
  );
}
