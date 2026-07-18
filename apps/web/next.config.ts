import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Issue #28 — Notion-style page cover images. Banners chosen from the Unsplash
  // picker are served from images.unsplash.com; allow next/image to optimize them.
  // (User-pasted arbitrary image URLs are rendered with the unoptimized escape
  // hatch on the <Image> itself, so they don't need a remotePattern here.)
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
  // Next 16: Turbopack is default; no explicit flag needed
  // Transpile our pure-TS workspace packages (ESM source, no build step).
  // Required so Next's bundler walks their TS files instead of trying to
  // resolve the .js-suffixed NodeNext-style imports literally.
  transpilePackages: [
    "@hyperpolymath/jarvis-core",
    "@hyperpolymath/personal-context-mcp",
    "@hyperpolymath/ui-icons",
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

  // Security response headers applied to every route. Clickjacking is covered
  // by X-Frame-Options + CSP frame-ancestors 'none'. We intentionally do NOT
  // ship a script-src/style-src CSP here: a misconfigured one silently breaks
  // the whole app (Next inline bootstrap, Supabase, Anthropic streaming, Google
  // OAuth, fonts), and it can't be verified without a real browser pass. Add a
  // full nonce-based CSP as a follow-up after testing in a Vercel preview.
  // microphone=(self) is required for in-browser voice (STT getUserMedia);
  // camera=(self) is required for the Studio's hand-tracking (HandLandmarker
  // getUserMedia). Both are same-origin only.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(self), geolocation=()",
          },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        ],
      },
    ];
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
