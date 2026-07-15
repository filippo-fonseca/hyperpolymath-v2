# Unit: unit-closeout — sd3 session closeout: excision, gates, canon docs [OPUS HIGH]

Read FIRST: /Users/filippofonseca/Developer/Projects/hyperpolymath-v2/.bgsd/runs/sesh-sd3-allfeatures/specs/UI-CONTRACT-SD3.md (§0/§1/§3 bind you), docs/DESIGN-SYSTEM.md, /design route source.

NOTE: any .planning/fable-plan-*.md for another unit is inherited history — ignore them. THIS file is your seed.

## Mission
All 15 sd3 build units are merged on this branch. You close the session out. Four jobs, each its own atomic commit(s):

1. GLASS EXCISION — globals.css still carries the old register's definitions (.glass-tile, .glass-button, related backdrop-blur/glow rules, roughly the :657-825 region, plus any legacy --hud-* or old --ink aliases that are now consumer-free). First PROVE zero consumers: `grep -rn "glass-tile\|glass-button" apps/web --include="*.tsx" --include="*.ts" --include="*.css"` (excluding globals.css itself and .planning). If a consumer remains, FIX that consumer to sd first (list it in your report), then excise the dead CSS. Also sweep truly-dead old-register keyframes/utilities globals defines that nothing references (prove each with a grep count in your report). This is the ONE unit sanctioned to make globals.css DELETIONS.
2. INTEGRATION GATES — pnpm --filter web typecheck AND pnpm --filter web build, both green post-excision. Boot dev on :3836, / 200, zero console errors on a public route.
3. CANON DOCS — update docs/DESIGN-SYSTEM.md + the /design route for what sd3 added: sfx system (lib/ui/sfx.ts cues + mute contract), dimensional icon recipe consumption pattern (local per-feature icons on the shared recipe), the JARVIS console grammar (mono voice, receipts, functional pills), data-series color law (cyan primary; functional amber/coral permitted as data-source/series encoding with mono legend chips REQUIRED), the WidgetCard v2 usage spread, inline-style token routing as the sanctioned Tailwind-scan-gap escape. Keep the docs' existing structure/voice; extend, don't rewrite.
4. PR DOSSIER — write .planning/sd3-PR-BODY.md: a complete PR description for bgsd/sd-all-features → next. Structure: one-paragraph summary; the 16-unit ledger (unit → one line + merge commit); sealed Conductor decisions/rulings; verification story (gates, frames, tester passes incl. infra-blocked ones); where the canon lives (docs/DESIGN-SYSTEM.md + /design); deferred items (Porcupine etc. — check .bgsd queue refs in RUN.md context section). Do NOT open the PR; the Conductor does.

## Fence
- globals.css (deletions sanctioned THIS UNIT ONLY, with grep proof per removal), any file needed to fix a residual glass consumer (list each), docs/DESIGN-SYSTEM.md, the /design route files, .planning/**.
- Do NOT restyle feature surfaces beyond consumer fixes. Server hygiene §3: kill only tcp:3836.

## Verification
Gates green (item 2). Grep proofs in the verification note (before/after counts for every excised class). Headless (lock protocol, ONE browser, release fast) on :3836: /design dark+light 1440x900 + landing hero dark as a no-regression sentinel. Evidence under .planning/ with sd3- prefix. status=awaiting_review, WAIT.
