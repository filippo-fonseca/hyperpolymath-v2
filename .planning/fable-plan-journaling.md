# Unit: unit-journaling — /journaling to the sd register [OPUS HIGH]

Read FIRST: /Users/filippofonseca/Developer/Projects/hyperpolymath-v2/.bgsd/runs/sesh-sd3-allfeatures/specs/UI-CONTRACT-SD3.md (§0/§1 bind you), docs/DESIGN-SYSTEM.md, and live sd exemplars: components/wiki/journal/* (the wiki journal rail is ALREADY-SD — reuse its grammar where sensible), components/lifeos/WidgetCard.tsx, /design.

NOTE: any .planning/fable-plan-sd3.md in this worktree is another unit's inherited seed — ignore it. THIS file is your seed.

## Mission
/journaling is OLD register (Scout A: glass-tile calendar JournalCalendar.tsx:251, glass-button nav :279/:290; JournalHistoryFeed.tsx:42/64 glass-tile; DayNavigator.tsx:29/46 glass-button; JournalEntryEditor 208 lines; 43 legacy --ink refs). The user singled journal out by name. Full surface pass to sd: same features, same data flow.

## Fence
- apps/web/components/journaling/** and apps/web/app/(app)/journaling/**
- globals.css ADDITIVE only. ui/ primitives OUT (already sd on your branch — consume).
- Do NOT touch components/wiki/journal/* (already sd, different surface) — read it only as a register reference.

## Register requirements
- Page scaffold: sd title row with the dimensional journal icon (components/ui/icons), 11px uppercase eyebrows, mono date labels.
- JournalCalendar: sd-tokenized month grid — `--sd-box` cells, 1px `--sd-line` grid, cyan fill intensity for entry days, today = cyan ring 1px; both themes via tokens (no white-alpha literals in light).
- DayNavigator: sd segmented control / ghost icon-buttons (no glass-button); mono 11px date.
- JournalHistoryFeed: entries as WidgetCard v2 mini-cards or clean sd list rows with hairline separators; chip strips for tags/meta.
- JournalEntryEditor: writing surface stays calm — `--sd-box` plate, generous padding, editor text at comfortable reading size (Space Grotesk; NO serif — logotype-only rule); toolbar as sd ghost icon row; save states as functional pills.
- Motion: zero-jank micro only; a gentle 140ms fade on day switch is welcome. Reduced-motion collapses.
- Tailwind scan gap (§0) applies.

## Verification
typecheck + build green. Headless (lock protocol, ONE browser, release fast) on port 3828: /journaling dark+light 1440x900, calendar crop both themes, editor focused state. If authed capture is impossible in your env, token-audit fallback + compiled-CSS proof per §1, Conductor pixel-verifies on :3000. Commit evidence under .planning/ with sd3- prefix. status=awaiting_review, WAIT.
