#!/usr/bin/env bash
# SessionStart hook: inject the repo's open GitHub issues into Claude's context
# so the triage flow in CLAUDE.md ("Session start: triage open issues") has the
# data ready the moment a session opens. Stdout from a SessionStart hook is
# added to the model's context.
#
# Fails open and quiet: if gh is missing, unauthed, or there are no open issues,
# it exits 0 with no output so it never blocks or noises up a session start.
set -uo pipefail

command -v gh >/dev/null 2>&1 || exit 0
gh auth status >/dev/null 2>&1 || exit 0

# Compact list only (number, title, labels). The repo is inferred from the git
# remote in the current working directory, so no slug is hardcoded.
ISSUES=$(gh issue list --state open --limit 30 \
  --json number,title,labels \
  --jq '.[] | "#\(.number) \(.title) [\(.labels | map(.name) | join(", "))]"' \
  2>/dev/null) || exit 0

[ -n "$ISSUES" ] || exit 0

cat <<EOF
Open GitHub issues in this repository (these include the kiwi-drafted issues filed automatically by the daily captures-to-issues cron). Per the "Session start: triage open issues" section of CLAUDE.md, lead the session by ranking these for Filippo (most tractable and highest-leverage first, one-line rationale each) and asking what he wants to tackle:

$ISSUES
EOF
