import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // googleapis is ~200MB (every Google API). Bundling it made the first hit on
  // any route importing lib/google-calendar take >15s in `next dev`; load it
  // from node_modules at runtime instead.
  serverExternalPackages: ["googleapis"],
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
