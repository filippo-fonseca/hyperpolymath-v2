#!/usr/bin/env bash
#
# Fast eligibility gate for the Kiwi auto-dev worker. Exits 0 (proceed) ONLY if
# every condition below holds; otherwise exits 1 quietly so launchd polling
# stays silent. All diagnostics go to stderr; nothing is printed to stdout on
# the ineligible path.
#
# Conditions (all required):
#   a. No date-stamped lock for today (run is idempotent per UTC day).
#   b. Current UTC time-of-day is at or after EARLIEST_UTC_HHMM.
#   c. At least one open issue carries the kiwi-drafted label.
set -euo pipefail

# Resolve this script's own directory, then source the sibling config.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=config.sh
source "${SCRIPT_DIR}/config.sh"

# Repo root is two levels up from tools/kiwi-autodev.
REPO="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# (a) Idempotency: skip if today's lock already exists.
LOCK="${REPO}/.kiwi-auto/.last-run-$(date -u +%F)"
if [ -f "${LOCK}" ]; then
  echo "kiwi-autodev gate: already ran today (${LOCK} exists)" >&2
  exit 1
fi

# (b) Time-of-day: compare as base-10 integers to strip any leading zero.
NOW_HHMM=$(date -u +%H%M)
if [ "$((10#${NOW_HHMM}))" -lt "$((10#${EARLIEST_UTC_HHMM}))" ]; then
  echo "kiwi-autodev gate: before earliest start (${NOW_HHMM} < ${EARLIEST_UTC_HHMM} UTC)" >&2
  exit 1
fi

# (c) Open-issue count: must be at least one open kiwi-drafted issue.
OPEN_COUNT="$(gh issue list --repo "${REPO_SLUG}" --state open --label "${LABEL}" --json number --jq 'length' 2>/dev/null || echo 0)"
if ! [ "${OPEN_COUNT}" -ge 1 ] 2>/dev/null; then
  echo "kiwi-autodev gate: no open ${LABEL} issues (count=${OPEN_COUNT})" >&2
  exit 1
fi

# All conditions met: proceed.
exit 0
