import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
      },
    ],
  },
  allowedDevOrigins:
    process.env.NODE_ENV === "development"
      ? ["flattop-depth-dropper.ngrok-free.dev"]
      : [],
};

export default nextConfig;
