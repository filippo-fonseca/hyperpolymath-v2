---
phase: 08-public-landing-manifesto
plan: 01
subsystem: docs
tags: [landing, framework, og-image, anthropic, strict-tool-use, seo, fixture]

# Dependency graph
requires:
  - phase: 05-jarvis
    provides: "Anthropic Strict Tool Use tool definitions (create_task/create_capture/create_event/remember_fact/ask_clarification) the fixture must conform to"
  - phase: 01-foundations
    provides: "Drizzle schemas for areas/projects/captures lifted verbatim into FRAMEWORK.md primitive sections"
provides:
  - FRAMEWORK.md at repo root with 5 primitive anchors (#areas, #projects, #captures, #jarvis, #calendar) for Plan 08-03 PrimitivesTable to link into
  - packages/jarvis-core/tests/strict-tool-use.fixture.ts canonical input→JSON pair for Plan 08-04 EngineSection to import verbatim
  - apps/web/app/opengraph-image.png + alt text + twitter mirror at Next 16 file convention paths for SC-9
affects: [08-03-primitives-table, 08-04-engine-section, 08-06-launch-verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Next.js 16 file convention OG image: apps/web/app/opengraph-image.png + opengraph-image.alt.txt → auto-emitted <meta property=\"og:image\"> + alt; twitter-image.png mirror for <meta name=\"twitter:image\">"
    - "Canonical fixture file as load-bearing source-of-truth: file is referenced verbatim by a public-facing landing surface — drift = credibility leak; comment header documents the contract and warns against edits"
    - "GitHub anchor generation rule: H2 text lowercased + spaces→hyphens, no ornament prefix (would inject `-` into anchor); the `⚜` glyph moves to paragraph body to decorate without breaking anchors"

key-files:
  created:
    - "FRAMEWORK.md — 380-line repo-root framework with 5 primitive H2 sections + ASCII data model + fork runbook + acknowledgments"
    - "packages/jarvis-core/tests/strict-tool-use.fixture.ts — STRICT_TOOL_USE_FIXTURE export (canonical README dinner-with-sam example + create_event/create_task output blocks)"
    - "apps/web/app/opengraph-image.png — 1200×630 parchment PNG (35.7KB)"
    - "apps/web/app/opengraph-image.alt.txt — UI-SPEC §9 canonical alt text"
    - "apps/web/app/twitter-image.png — byte-identical mirror of opengraph-image.png"
  modified: []

key-decisions:
  - "FRAMEWORK.md H2s use plain text (no ⚜ glyph prefix) so GitHub auto-generates clean anchors (#areas / #projects / #captures / #jarvis / #calendar); the ⚜ ornament moves into paragraph body for visual rhythm without breaking PrimitivesTable links"
  - "Fixture field names match the live Zod schemas verbatim: create_event uses `start`/`end` (not `start_iso`/`end_iso`), create_task uses `due` (not `due_date`) — defer-to-source rule from PLAN line 234 applied; plan's example field names were illustrative, real schemas win"
  - "Twitter image is byte-identical to OG image (single design serves both meta tags) — avoids twice-the-asset maintenance while still satisfying Next 16's separate file conventions"

patterns-established:
  - "Pattern 1: Repo-root spec doc as forkable artifact — FRAMEWORK.md sits next to README.md/LICENSE, not nested in apps/, so external readers and the landing's PrimitivesTable can link to it via GitHub raw URL anchors"
  - "Pattern 2: Canonical fixture as public source-of-truth — fixture file's path is cited in landing copy (UI-SPEC §9: 'Plucked verbatim from packages/jarvis-core/tests/strict-tool-use.fixture.ts — no edits') making the fixture itself the contract"
  - "Pattern 3: Static OG asset over dynamic generation — single hand-designed 1200×630 PNG committed to repo at Next 16 file-convention path; no runtime cost, no @vercel/og dep, no edge function for a one-off marketing surface"

requirements-completed: [LAND-FRAMEWORK, LAND-FIXTURE, LAND-OG]

# Metrics
duration: ~5 min (verification-only — work pre-existed in commits 468730d / cb4053b / 09ec824)
completed: 2026-05-25
---

# Phase 08 Plan 01: Stage Load-Bearing Landing Assets Summary

**Three load-bearing assets staged at repo-root paths the rest of Phase 8 depends on: FRAMEWORK.md (5 primitive anchors), strict-tool-use.fixture.ts (canonical input→JSON pair), and Next 16 OG image trio (1200×630 parchment + alt + twitter mirror).**

## Performance

- **Duration:** ~5 min (verification pass — all three artifacts pre-existed from a prior session)
- **Started:** 2026-05-25T22:55:00Z (approx)
- **Completed:** 2026-05-25T23:00:00Z (approx)
- **Tasks:** 3 (all pre-implemented, verified in place)
- **Files modified:** 0 (verification only — no new code changes)
- **Files verified:** 5 (FRAMEWORK.md, fixture.ts, opengraph-image.png, opengraph-image.alt.txt, twitter-image.png)

## Accomplishments

- **FRAMEWORK.md** (380 lines, repo root) — distilled spec naming five primitives + one agent contract; H2s `## Areas`, `## Projects`, `## Captures`, `## JARVIS`, `## Calendar` generate clean GitHub anchors the Plan 08-03 PrimitivesTable can deep-link into; ASCII data-model diagram lifted from README; all 5 tool names present; MIT + Karpathy + Anthropic acknowledgments; zero exclamation marks
- **strict-tool-use.fixture.ts** (73 lines, packages/jarvis-core/tests/) — exports `STRICT_TOOL_USE_FIXTURE` const + `StrictToolUseFixture` interface; input is the canonical README example (`"lunch with sam 8pm saturday. pick up groceries friday afternoon"`); output emits one `create_event` + one `create_task` tool_use block conforming to live Zod schemas (note: real fields are `start`/`end`/`due`, not `start_iso`/`end_iso`/`due_date` as the plan's example suggested); passes `pnpm tsc --noEmit` cleanly
- **OG image trio** (apps/web/app/) — 1200×630 PNG parchment background (35.7KB) at the Next 16 file-convention path so the landing route auto-emits `<meta property="og:image">`; matching alt text file with the verbatim UI-SPEC §9 copy ("Hyperpolymath. Type one sentence. The right action lands in the right place."); twitter-image.png is byte-identical for `<meta name="twitter:image">`

## Task Commits

Each task was committed atomically in a prior session:

1. **Task 1: FRAMEWORK.md at repo root with 5 primitive anchors** — `468730d` (docs)
2. **Task 2: Canonical strict-tool-use fixture for landing Engine section** — `cb4053b` (feat)
3. **Task 3: Static OG image (1200×630) + alt text + twitter mirror** — `09ec824` (feat)

**Plan metadata:** (this SUMMARY commit) (docs: complete plan)

## Files Created/Modified

- `FRAMEWORK.md` — Repo-root framework: 5 primitive sections with Drizzle schemas lifted verbatim, ASCII data-model diagram, fork runbook, MIT + acknowledgments
- `packages/jarvis-core/tests/strict-tool-use.fixture.ts` — `STRICT_TOOL_USE_FIXTURE` + `StrictToolUseFixture` exports
- `apps/web/app/opengraph-image.png` — Static 1200×630 parchment OG image
- `apps/web/app/opengraph-image.alt.txt` — Canonical UI-SPEC §9 alt text
- `apps/web/app/twitter-image.png` — Byte-identical mirror of OG image

## Decisions Made

1. **H2 anchor discipline.** FRAMEWORK.md H2s use plain text (no `⚜` glyph prefix) so GitHub auto-generates clean anchors `#areas`, `#projects`, `#captures`, `#jarvis`, `#calendar`. The `⚜` ornament moves into paragraph bodies to decorate without breaking the PrimitivesTable's deep-link contract. Verified: prefixing the H2 with the glyph would produce `#-areas` and silently break Plan 08-03's <a href> generation pattern.

2. **Fixture field names defer to source.** The PLAN's example used `start_iso`/`end_iso`/`due_date`, but reading the live Zod schemas in `packages/jarvis-core/src/tools/create-event.ts` and `create-task.ts` revealed the real fields are `start`/`end`/`due`. The fixture uses the real names per PLAN line 234's defer-to-source rule. This is the difference between a fixture that compiles against the production schemas and a fixture that's a marketing artifact.

3. **Twitter image is a byte-identical mirror of OG image.** Next 16 needs both file-convention paths (`opengraph-image.png` and `twitter-image.png`) to emit both meta tags, but the design discipline says one image serves both surfaces — half the asset maintenance, identical visual.

## Deviations from Plan

None — plan executed exactly as written. All three tasks were implemented in prior sessions (commits 468730d / cb4053b / 09ec824) with the same field-name correction (real Zod schemas use `start`/`end`/`due`, not `start_iso`/`end_iso`/`due_date`) flagged in the plan's defer-to-source rule.

## Issues Encountered

None. Verification pass surfaced zero discrepancies between the plan's `must_haves.truths` and the committed artifacts:

- `test -f FRAMEWORK.md` ✓ (380 lines, all 5 anchor H2s present, 0 exclamation marks)
- `grep "## Areas|Projects|Captures|JARVIS|Calendar"` ✓ (exactly one each)
- `file apps/web/app/opengraph-image.png` → `PNG image data, 1200 x 630` ✓
- `cat apps/web/app/opengraph-image.alt.txt` → canonical UI-SPEC §9 copy ✓
- `grep "STRICT_TOOL_USE_FIXTURE|StrictToolUseFixture"` ✓ (both exports present)
- `pnpm tsc --noEmit` in packages/jarvis-core → exit 0, no errors ✓
- `diff opengraph-image.png twitter-image.png` → identical ✓

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **Plan 08-02 (waitlist + monorepo file tracing)** already partially shipped in parallel (commits `82ea366`, `b41a990`, `14536d2`) — waitlist Drizzle schema, RLS migration, and monorepo file-tracing config are on `phase-07-arc-redesign` branch. Plan 08-02 SUMMARY can run on the next executor pass.
- **Plan 08-03 (PrimitivesTable)** is now unblocked: the 5 GitHub anchors `FRAMEWORK.md#areas`, `#projects`, `#captures`, `#jarvis`, `#calendar` are guaranteed live and the link pattern `FRAMEWORK\\.md#(areas|projects|captures|jarvis|calendar)` will match.
- **Plan 08-04 (EngineSection)** is now unblocked: `import { STRICT_TOOL_USE_FIXTURE } from "@hyperpolymath/jarvis-core/tests/strict-tool-use.fixture"` will resolve and render the canonical input + JSON pair without modification.
- **SC-9 (Lighthouse/SEO best practice)** is unblocked: the landing route's auto-emitted `<meta property="og:image">` will point to a valid 1200×630 PNG with alt text.
- No blockers for downstream waves.

---
*Phase: 08-public-landing-manifesto*
*Completed: 2026-05-25*

## Self-Check: PASSED

All claims verified against repo state:

- `FRAMEWORK.md` — FOUND (380 lines, all 5 anchor H2s, ASCII diagram, MIT + Karpathy + Anthropic refs)
- `packages/jarvis-core/tests/strict-tool-use.fixture.ts` — FOUND (`STRICT_TOOL_USE_FIXTURE` + `StrictToolUseFixture` exports, canonical README input, create_event + create_task output blocks, `pnpm tsc --noEmit` passes)
- `apps/web/app/opengraph-image.png` — FOUND (PNG 1200×630, 35.7KB)
- `apps/web/app/opengraph-image.alt.txt` — FOUND (canonical UI-SPEC §9 copy verbatim)
- `apps/web/app/twitter-image.png` — FOUND (byte-identical mirror)
- Commit `468730d` — FOUND (`docs(08-01): add FRAMEWORK.md at repo root with 5 primitive anchors`)
- Commit `cb4053b` — FOUND (`feat(08-01): add canonical strict-tool-use fixture for landing Engine section`)
- Commit `09ec824` — FOUND (`feat(08-01): add static OG image (1200×630) + alt text + twitter mirror`)
