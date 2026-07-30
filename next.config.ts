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
