import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Next 16: Turbopack is default; no explicit flag needed
  // Transpile our pure-TS workspace packages (ESM source, no build step).
  // Required so Next's bundler walks their TS files instead of trying to
  // resolve the .js-suffixed NodeNext-style imports literally.
  transpilePackages: [
    "@hyperpolymath/jarvis-core",
    "@hyperpolymath/personal-context-mcp",
  ],

  // Phase 8 (LAND-ROADMAP-FS / D-09):
  // Rebase output file tracing to the monorepo root so we can include files
  // OUTSIDE apps/web/ (e.g., .planning/ROADMAP.md) in the serverless function
  // bundle. The BuildLog Server Component reads ROADMAP.md via fs.readFileSync
  // and parses the "## Progress" table for the "currently shipping" line.
  //
  // See 08-RESEARCH.md Pattern 4 (Q3 resolution) and Pitfall 2 (verify includes
  // by deploying to a Vercel preview branch and checking for ENOENT in function logs).
  outputFileTracingRoot: path.join(__dirname, "../../"),
  outputFileTracingIncludes: {
    // The "/" key targets the root route (the landing). Narrowest scope possible.
    "/": ["../../.planning/ROADMAP.md"],
  },

  // Phase 22: the "Pages" feature was renamed to "Wiki" and the route moved
  // from /pages to /wiki. Permanently redirect the old paths so any saved
  // links or bookmarks still resolve. The :pageId segment is preserved.
  async redirects() {
    return [
      { source: "/pages", destination: "/wiki", permanent: true },
      {
        source: "/pages/:pageId",
        destination: "/wiki/:pageId",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
