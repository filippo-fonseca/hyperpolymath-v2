---
id: 260618-eu2
slug: widen-kiwi-autodev-worker-beyond-kiwi-dr
status: complete
date: 2026-06-18
---

# Widen kiwi-autodev worker beyond kiwi-drafted issues

## Problem

The overnight worker only ever considered issues carrying the `kiwi-drafted`
label (applied by the captures-to-issues cron). Issues filed any other way
(`gh issue create`, the GitHub UI) were invisible to it, even small tractable
ones the worker could have handled.

## Change

1. **Optional `LABEL`** — empty now means "consider every open issue"; a
   non-empty value restricts the worker to that label. `gate.sh` and `run.mjs`
   only pass `--label` when `LABEL` is set.
2. **`EXCLUDE_LABELS` opt-out** (default `blocked`) — any issue carrying one of
   these is dropped from the candidate list, even when `LABEL` is empty. The
   inverse of the opt-in label we removed: lets an issue be marked hands-off
   (too big, WIP, a human is on it).
3. **Open-PR dedup** — issues that already have an open `kiwi/auto/*-issue-N`
   review PR are skipped, so widening the net does not spawn a fresh duplicate
   PR for an issue whose prior PR is still unmerged.

Triage's size/self-containment bar is unchanged, so every candidate is still
vetted for "small, easy" before the worker attempts it.

## Boundary / known limitation

The dedup only recognizes the worker's own `kiwi/auto/*` PRs. A human PR linked
to an issue (branch name does not encode the issue number) is not auto-detected;
use the `blocked` label to keep the worker off human-WIP issues.

## Files

- `tools/kiwi-autodev/config.sh` — `LABEL` now empty by default; add `EXCLUDE_LABELS=blocked`.
- `tools/kiwi-autodev/gate.sh` — search-query candidate count (optional label + negative labels).
- `tools/kiwi-autodev/run.mjs` — optional `--label`, label-exclusion filter, `openPrIssueNumbers()` dedup, updated log line.
- `README.md`, `install.sh`, `*.plist` — doc/comment updates.
