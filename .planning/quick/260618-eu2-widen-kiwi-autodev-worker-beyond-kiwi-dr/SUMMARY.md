---
id: 260618-eu2
slug: widen-kiwi-autodev-worker-beyond-kiwi-dr
status: complete
date: 2026-06-18
commit: bd044ca
---

# Summary

Widened the kiwi-autodev overnight worker so it is no longer restricted to
`kiwi-drafted` issues.

- `LABEL` is now optional (empty = every open issue); `gate.sh` and `run.mjs`
  only pass `--label` when it is set.
- Added `EXCLUDE_LABELS` opt-out (default `blocked`) — dropped before triage.
- Added `openPrIssueNumbers()` dedup — skips issues with an open `kiwi/auto/*`
  PR so the wider net does not produce duplicate PRs.
- Triage size rules unchanged; updated README/plist/install/comment text.

## Validation

- `node --check run.mjs`, `bash -n gate.sh`, `bash -n config.sh` all pass.
- Live: `gate.sh` exits 0 with 15 open issues (none `blocked`); the gate
  exclude-label search returns the expected count; the open-PR dedup regex
  returns an empty set against the four current open PRs (none are `kiwi/auto`).

## Boundary

Dedup recognizes only the worker's own `kiwi/auto/*` PRs; human PRs linked to an
issue are not auto-detected — use `blocked` to keep the worker off those.

## Deploy note

Change takes effect only after the runtime worktree
(`hyperpolymath-v2-kiwi-runtime`) is refreshed to the commit once merged.
