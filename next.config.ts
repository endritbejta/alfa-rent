import type { NextConfig } from "next";

const securityHeaders: { key: string; value: string }[] = [
  {
    key: "Content-Security-Policy",
    value:
      "base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), geolocation=(), microphone=()",
  },
];

/*
 * HSTS is only valid when the origin is actually served over HTTPS.
 * `next start` is a production build too, but local development still uses
 * http://localhost; emitting HSTS there can make browsers upgrade a working
 * local URL to an HTTPS endpoint that does not exist.
 */
if (
  process.env.NODE_ENV === "production" &&
  process.env.AUTH_URL?.startsWith("https://")
) {
  securityHeaders.push({
    key: "Strict-Transport-Security",
    value: "max-age=31536000",
  });
}

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  images: {
    /*
     * Cloudinary resizes and re-encodes from the already-normalised asset
     * through its own URL transforms, so next/image asks it for the width it
     * wants instead of having Vercel's optimizer fetch and process every
     * image a second time. `sizes` and the rest of the next/image API are
     * unaffected — only the URL it emits changes.
     */
    loader: "custom",
    loaderFile: "./src/lib/cloudinary/image-loader.ts",
    /*
     * Only consulted by the built-in optimizer, which the loader above now
     * bypasses. Kept so that removing the loader restores a working default
     * rather than a broken one.
     */
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        pathname: "/**",
      },
    ],
  },
  // No bodySizeLimit override: photos upload from the browser straight to
  // Cloudinary, so actions now carry only JSON and the 1 MB default is ample.
  // Raising it was misleading anyway — Vercel caps function request bodies at
  // 4.5 MB regardless of what Next.js is told, which is what made uploading
  // two phone photos fail in production while working locally.
};

export default nextConfig;
