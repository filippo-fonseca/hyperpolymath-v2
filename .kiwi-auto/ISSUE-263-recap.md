# Issue #263 — skipped

**Status: skipped** (BAD fit for an unattended session — depends on unbuilt/unmerged work)

## Issue
"Studio polish trio: orb drag listener leak, WhatsApp 30s poll, emitStudioAction userId"

Three fixes from REVIEW.md MAJORs 4–6:
1. `OrbWidget` leaks global pointer listeners on cancelled drags — add unmount cleanup.
2. `WhatsAppWidget` 30s hard poll should use Realtime invalidation.
3. Add a `userId` field to `emitStudioAction` so the bus is partitionable beyond the owner gate.

## Why skipped
All three targets live in the **Studio v2 widget canvas**, which has **not been merged** into `main`/`next`. The code is absent from this session's base branch and exists only on unmerged feature branches:

- `OrbWidget` / `WhatsAppWidget` — present only on `bgsd/orb-widget`, `bgsd/showcase-widgets`, `bgsd/studio-native`, `bgsd/web-studio-strip`, `bgsd/hand-cursor`.
- `emitStudioAction` (+ `apps/web/lib/voice/physical-extension/bus.ts`, `apps/web/lib/jarvis/executor.ts`, `apps/web/tests/studio-action-bus.test.ts`) — present only on unmerged commits (e.g. `535dff07`), not on `main`.

Verification run from the worktree:
- `grep -rln "OrbWidget|WhatsAppWidget|emitStudioAction"` over the tree (excluding `node_modules`) → **no matches**.
- Base branch `kiwi/auto/2026-07-12-issue-263` is at `532a01b2` (off `main`); none of the three symbols exist here.

This matches the standing note that the Studio v2 widget canvas is awaiting a human merge (PR #257).

## Why this is the right call for an unattended slot
Fixing #263 here would require basing the work off an unmerged feature branch (and picking which of five `bgsd/*` branches is canonical), then producing a PR that could not merge cleanly into `main` because the underlying feature isn't there. That is speculative, multi-branch, and risky to do unattended — exactly the "depends on unbuilt work" case the orchestrator guidance says to defer, and outside the "small, self-contained, certain" bar for a single 45-minute slot.

## Recommendation
Re-queue #263 after the Studio v2 widget canvas (PR #257) is merged into `main`/`next`. Once the target files exist on the base branch, all three fixes are small and self-contained and become a genuinely good fit. No branch changes were made this session beyond committing this recap.
