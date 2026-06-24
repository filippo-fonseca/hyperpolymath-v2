#!/usr/bin/env bash
#
# Idempotent installer for the local Kiwi auto-dev worker. It:
#   1. substitutes __REPO__ in the plist template with this repo's absolute path
#      and writes the result to ~/Library/LaunchAgents/,
#   2. ensures the logs dir exists,
#   3. (re)loads the LaunchAgent safely (bootout then bootstrap, with a load -w
#      fallback), and
#   4. installs the pre-push guard via install-hook.sh.
#
# NOTHING about the worker runs until you run this script. Safe to run twice.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "${SCRIPT_DIR}/../.." && pwd)"

LABEL="com.hyperpolymath.kiwi-autodev"
TEMPLATE="${SCRIPT_DIR}/${LABEL}.plist"
LA_DIR="${HOME}/Library/LaunchAgents"
TARGET="${LA_DIR}/${LABEL}.plist"

if [ ! -f "${TEMPLATE}" ]; then
  echo "install: plist template not found at ${TEMPLATE}" >&2
  exit 1
fi

mkdir -p "${LA_DIR}"
mkdir -p "${SCRIPT_DIR}/logs"

# Substitute __REPO__ into a temp file, then move into place. The committed
# template is never mutated. Use a sed delimiter that cannot appear in a path.
TMP="$(mktemp)"
trap 'rm -f "${TMP}"' EXIT
sed "s|__REPO__|${REPO}|g" "${TEMPLATE}" > "${TMP}"
mv "${TMP}" "${TARGET}"
trap - EXIT
echo "install: wrote ${TARGET}"

UID_NUM="$(id -u)"
DOMAIN="gui/${UID_NUM}"

# Reload idempotently: bootout any existing instance first so re-running is
# safe, then bootstrap. Fall back to the legacy load -w if bootstrap is absent.
if launchctl bootout "${DOMAIN}/${LABEL}" >/dev/null 2>&1; then
  echo "install: booted out existing ${LABEL}"
fi
if launchctl bootstrap "${DOMAIN}" "${TARGET}" >/dev/null 2>&1; then
  echo "install: bootstrapped ${LABEL} into ${DOMAIN}"
else
  echo "install: bootstrap unavailable or failed; trying legacy load -w"
  launchctl unload -w "${TARGET}" >/dev/null 2>&1 || true
  launchctl load -w "${TARGET}"
  echo "install: loaded ${LABEL} via load -w"
fi

# Install the pre-push guard (never clobbers the gitleaks pre-commit).
"${SCRIPT_DIR}/install-hook.sh"

cat <<NEXT

install: done.

Next steps:
  - Verify the agent is registered:
      launchctl list | grep kiwi-autodev
  - Logs live at:
      ${SCRIPT_DIR}/logs/launchd.out
      ${SCRIPT_DIR}/logs/launchd.err
      ${SCRIPT_DIR}/logs/<date>-issue-<n>.log
  - The gate keeps the worker idle until BOTH the daily time window has opened
    (EARLIEST_UTC_HHMM in config.sh) AND at least one open candidate issue
    exists. Until then every poll exits immediately and silently.
  - Review results in .kiwi-auto/recap-<date>.md and the DEVELOPMENT tab on
    /insights. Auto branches are review-only under kiwi/auto/*; merge manually.
NEXT
