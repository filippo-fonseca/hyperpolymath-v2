---
quick_id: 260615-n2v
slug: update-og-social-metadata-image-title-an
date: 2026-06-15
status: complete
---

# Quick Task 260615-n2v: Summary

## What changed

- **Social card image → README hero.** Replaced the dynamic `next/og`
  ImageResponse routes (`apps/web/app/opengraph-image.tsx`,
  `twitter-image.tsx`) with static PNGs copied from `.github/assets/readme-hero.png`.
  Added `opengraph-image.alt.txt` / `twitter-image.alt.txt` to preserve alt text.
  Next.js now emits `og:image` / `twitter:image` from the file convention.
- **Title.** `metadata.title.default`, `openGraph.title`, `twitter.title` →
  "Hyperpolymath | A personal life-OS for people who refuse to specialize."
  (`%s · Hyperpolymath` subpage template kept.)
- **Description.** All three descriptions →
  "I brought back the Renaissance Human, and gave them JARVIS from Tony Stark,
  all in one. A platform and a framework, fully open source. Use mine, or build
  your own."

## Verification

- `next build` succeeds. `/opengraph-image.png` and `/twitter-image.png` now
  build as static routes (`○`) instead of dynamic functions.
- `lib/og/fonts` retained — still imported by `apple-icon.tsx`,
  `api/branding/asset/route.tsx`, `lib/branding/svg.tsx`.
- Pre-existing `tsc` errors in `tests/api-jarvis-tts.test.ts` are unrelated to
  this change.

## Branch / push

- Committed on `chore/og-social-metadata`, forked from `origin/main`, to keep
  the unrelated `feat/kiwi-autodev-worker` commits out of prod.
- Push strategy confirmed with user before pushing.
