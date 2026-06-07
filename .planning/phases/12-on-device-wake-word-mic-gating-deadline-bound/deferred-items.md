# Phase 12 — Deferred Items

Out-of-scope issues discovered during Plan 12-01 execution. NOT caused by
Plan 12-01 changes — pre-existing on disk in untracked work.

## Pre-existing typecheck failures (out of scope for Plan 12-01)

Discovered: 2026-05-31 during Plan 12-01 Task 4 verification.
Verified pre-existing via `git stash` rollback — failures persist with
zero Plan 12-01 changes applied (only the wake-word RED test imports
are affected by stash).

### 1. `.next/types/validator.ts(116,39)` — missing lifeos page type

```
.next/types/validator.ts(116,39): error TS2307:
  Cannot find module '../../app/(app)/lifeos/page.js' or its corresponding
  type declarations.
```

Root cause: `app/(app)/lifeos/` is untracked in-progress work (phase
999.10 — markdown-writing-surface-mem-style-freeform-notes). The Next.js
type validator has cached a reference to it. Owned by that phase.

### 2. `app/(app)/insights/page.tsx(68,11)` — analytics prop mismatch

```
app/(app)/insights/page.tsx(68,11): error TS2322:
  Type '{ analytics: AnalyticsData; jarvis: { hasData: boolean; data: InsightsData; }; ... }'
  is not assignable to type 'IntrinsicAttributes & Props'.
  Property 'analytics' does not exist on type 'IntrinsicAttributes & Props'.
```

Root cause: modified `components/insights/InsightsTabs.tsx` doesn't accept
the `analytics` prop that the page is passing. Both files are in the
working tree's pre-Plan-12-01 dirty state (see git status at plan start).
Owned by whoever is touching the insights surface.

## Resolution

These errors are NOT introduced by Plan 12-01 and do NOT affect the
wake-word pipeline. Plan 12-01's own files (lib/voice/wake-word-client.ts,
lib/voice/wake-word-types.ts, lib/voice/constants.ts) compile cleanly.

Scope-boundary policy applies (per GSD deviation rules): do not auto-fix
unrelated pre-existing failures. Logged here for the next phase owner.
