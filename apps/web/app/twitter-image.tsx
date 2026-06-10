// Twitter card mirrors the Open Graph image one-to-one. The renderer is
// re-exported from ./opengraph-image so the asset stays in lock-step across
// X / Twitter / LinkedIn / iMessage / Slack previews. Route segment config
// fields (`runtime`, `size`, `contentType`, `alt`) MUST be inlined here —
// Next.js can't statically analyze them through a re-export.
export { default } from "./opengraph-image";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt =
  "Hyperpolymath — a unified life-OS with JARVIS at the centre.";
