import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
