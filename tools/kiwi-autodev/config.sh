#!/usr/bin/env bash
#
# Kiwi auto-dev worker config. This file is SOURCED (not executed) by
# gate.sh, launchd-entry.sh, and (indirectly, via the launchd env) run.mjs.
# Edit the values below to tune the worker; everything here is a safe default.
#
# IMPORTANT (secret handling): the dev-runs ingest secret is NEVER stored in
# this committed file. run.mjs reads DEV_RUN_INGEST_SECRET at runtime from the
# environment, falling back to parsing apps/web/.env.local. If neither has it,
# reporting is skipped with a warning and the run still succeeds. Do not add the
# secret here, and do not commit it anywhere.

# How many open kiwi-drafted issues to attempt per run (oldest-first). Each one
# runs in its own git worktree and branch, in parallel.
export MAX_ISSUES=3

# Per-issue wall-clock cap, in milliseconds (45 minutes). The cap is enforced
# in Node via a setTimeout that kills the child process group; it does NOT rely
# on the timeout/gtimeout binary (not installed on this machine). See run.mjs.
export PER_ISSUE_TIMEOUT_MS=2700000

# The Claude model the headless agent uses. "opus" is the latest Opus model and
# is an explicit user choice: keep it.
export MODEL=opus

# The GitHub issue label the daily captures-to-issues cron applies. The worker
# only ever touches issues carrying this label.
export LABEL=kiwi-drafted

# Earliest UTC time-of-day (HHMM) the worker is allowed to start. The cron files
# issues at 06:00 UTC, so 0610 gives it a small buffer. Compared as a base-10
# integer in gate.sh so a leading zero does not break the comparison.
export EARLIEST_UTC_HHMM=0610

# Branch namespace for every auto-dev branch. The pre-push hook hard-blocks any
# push of refs under refs/heads/kiwi/auto/*, so these branches are review-only.
export BRANCH_PREFIX=kiwi/auto

# The GitHub repo the worker reads issues from and links branches to.
export REPO_SLUG=filippo-fonseca/hyperpolymath-v2

# Base URL where the run summary is POSTed (to ${REPORT_URL}/api/dev-runs). The
# report is best-effort: a failure only logs a warning.
export REPORT_URL=https://hyperpolymath.com
