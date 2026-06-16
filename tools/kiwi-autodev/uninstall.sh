#!/usr/bin/env bash
#
# Idempotent uninstaller. Reverses install.sh: boots out / unloads the
# LaunchAgent and removes the installed plist. It tolerates the agent or plist
# already being gone.
#
# It does NOT remove the pre-push guard by default: that guard is a safety net
# and leaving it is harmless. Instructions to remove it manually are printed at
# the end.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

LABEL="com.hyperpolymath.kiwi-autodev"
TARGET="${HOME}/Library/LaunchAgents/${LABEL}.plist"
UID_NUM="$(id -u)"
DOMAIN="gui/${UID_NUM}"

# Boot out the running agent (modern), falling back to unload -w (legacy).
if launchctl bootout "${DOMAIN}/${LABEL}" >/dev/null 2>&1; then
  echo "uninstall: booted out ${LABEL}"
elif [ -f "${TARGET}" ] && launchctl unload -w "${TARGET}" >/dev/null 2>&1; then
  echo "uninstall: unloaded ${LABEL} via unload -w"
else
  echo "uninstall: ${LABEL} was not loaded (nothing to boot out)"
fi

# Remove the installed plist if present.
if [ -f "${TARGET}" ]; then
  rm -f "${TARGET}"
  echo "uninstall: removed ${TARGET}"
else
  echo "uninstall: ${TARGET} not present (already removed)"
fi

cat <<NOTE

uninstall: done. The LaunchAgent is removed; the worker will no longer run.

The pre-push guard was left in place on purpose (it is a harmless safety net).
To remove it, edit your hooks dir (run: git config core.hooksPath) and:
  - delete the kiwi-autodev-pre-push sidecar, and
  - either delete the pre-push dispatcher, or remove the block between the
    "kiwi-autodev pre-push guard" sentinel comments from an existing pre-push.
Do NOT touch pre-commit (it runs gitleaks).
NOTE
