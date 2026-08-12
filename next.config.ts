import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // The local PWA is often opened through 127.0.0.1. Next 16 otherwise
  // rejects its development chunks as a cross-origin request, leaving the
  // static UI visible but every React control inactive.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
