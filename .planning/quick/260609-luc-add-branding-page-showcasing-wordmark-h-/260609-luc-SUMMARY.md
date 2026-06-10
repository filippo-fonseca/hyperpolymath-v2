---
phase: quick/260609-luc
plan: 01
subsystem: web/branding
tags: [brand, ui, document-register]
one-liner: "Canonical /branding reference page with wordmark/monogram/Kiwi/JARVIS lockups in 5 token-named swatches"
requires: ["@/components/shared/HudCoreBubble", "@/components/landing/SectionEyebrow", "/public/icons/kiwi-bird.svg (inline path)"]
provides: ["/branding route", "BrandChip / WordmarkGlyph / KiwiGlyph (co-located, page-private)"]
affects: ["apps/web/app/(app)/branding/page.tsx"]
tech-stack:
  added: []
  patterns: ["Server Component in (app) shell", "co-located presentational subcomponents", "agent-mode-scope opt-in (single surface only)"]
key-files:
  created:
    - apps/web/app/(app)/branding/page.tsx
  modified: []
decisions:
  - "Used react/import { type ReactNode } instead of React.ReactNode to keep this a pure Server Component without React-namespace import noise"
  - "JARVIS tile is the ONLY surface that activates .agent-mode-scope — document register everywhere else, per CLAUDE.md restraint-over-theatrics directive"
  - "Inline kiwi-bird SVG path (per plan) rather than importing the SVG file as a component — guarantees fill-color theming"
metrics:
  duration: "~5min"
  completed: "2026-06-09"
  tasks: 1
  files: 1
---

# Quick 260609-luc Plan 01: Branding Page Summary

Shipped `apps/web/app/(app)/branding/page.tsx` — a Server Component that documents the Hyperpolymath visual identity across four sections (Wordmark, Monogram, Kiwi by Hyperpolymath, JARVIS by Hyperpolymath), each rendering in five token-named swatch variations. The JARVIS section is the only surface that opts into the cyan `.agent-mode-scope` HUD treatment; everything else stays in document register per the CLAUDE.md "restraint over theatrics" directive.

## What Was Built

- `/branding` route under the authenticated `(app)` shell (auth + AppShell inherited from the existing layout)
- Co-located presentational primitives in the page file: `BrandChip`, `WordmarkGlyph`, `KiwiGlyph`, `Section`
- A `SWATCHES` constant defining the five canonical color treatments: ink-on-canvas, canvas-on-ink, pure black-on-white, pure white-on-black, cyan-on-black
- Inline Kiwi-bird SVG path (from `/public/icons/kiwi-bird.svg`) so each variant can be re-colored via `fill`
- JARVIS lockup tile (240×240, `--surface-raised` background, `--edge-hud` border) wrapping `HudCoreBubble` inside `.agent-mode-scope`
- `export const metadata = { title: "Brand · Hyperpolymath" }`

## Decisions Made

- **`import type { ReactNode } from "react"`** instead of `React.ReactNode` — avoids importing the React namespace into a Server Component just for a single type reference.
- **JARVIS-only `.agent-mode-scope`** — confirmed in the plan and reinforced by CLAUDE.md MEMORY entries (`feedback_ui_pattern_restraint`, `project_phase61_directional_anchors`).
- **Inline SVG path** rather than `<Image src="/icons/kiwi-bird.svg" />` so each variant gets its own `fill` color without forcing CSS masking.

## Deviations from Plan

None. Plan executed exactly as written.

## Verification

- `pnpm --filter web exec tsc --noEmit` was run; **zero errors attributable to the new file**. The repo has unrelated pre-existing TS errors in `components/training/*` and `tests/api-jarvis-tts.test.ts` (out of scope per scope-boundary rule — logged below).
- `grep -i branding` against the typecheck output returns empty — confirms the new page compiles cleanly.

## Deferred Issues (Pre-existing, Out of Scope)

These TS errors exist on `main`-equivalent state and are unrelated to this plan:

- `components/training/CreateRecurringDialog.tsx:5` — missing export `createSeries` from `@/app/actions/training`
- `components/training/TrainingMonthView.tsx:306,308` — `icon` property accessed on a type that lacks it
- `tests/api-jarvis-tts.test.ts` (multiple lines) — passing native `Request` where `NextRequest` is expected

These should be addressed in a dedicated cleanup plan; they do not block `/branding`.

## Commits

- `13c20ae` — feat(quick/260609-luc-01): add /branding reference page

## Self-Check: PASSED

- FOUND: `apps/web/app/(app)/branding/page.tsx`
- FOUND commit: `13c20ae`
- New file produces no TypeScript errors
