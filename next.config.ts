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
  experimental: {
    serverActions: {
      // Vehicle image uploads go through server actions as FormData.
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
