import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Next 16: Turbopack is default; no explicit flag needed
  // Transpile our pure-TS workspace package (ESM source, no build step).
  // Required so Next's bundler walks @hyperpolymath/jarvis-core's TS files.
  transpilePackages: ["@hyperpolymath/jarvis-core"],
};

export default nextConfig;
