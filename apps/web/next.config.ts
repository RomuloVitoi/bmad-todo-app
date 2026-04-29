import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output emits a self-contained .next/standalone/server.js
  // with only the production node_modules needed at runtime. Required for
  // the multi-stage Docker pattern in apps/web/Dockerfile (Story 1.11).
  output: "standalone",
};

export default nextConfig;
