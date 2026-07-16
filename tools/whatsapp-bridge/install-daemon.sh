#!/usr/bin/env bash
#
# install-daemon.sh — install the WhatsApp bridge as a persistent launchd agent.
#
# Runs the Go bridge (tools/whatsapp-bridge/main.go) 24/7, independent of the
# Tauri desktop app, so the WhatsApp linked-device connection survives desktop
# restarts and app-closed periods. The desktop then detects this daemon on
# :8080 and adopts it as a client rather than spawning its own child.
#
# What it does (all idempotent — safe to re-run):
#   1. Builds the bridge binary (GOOS=darwin GOARCH=arm64) to a STABLE path:
#        ~/Library/Application Support/io.hyperpolymath.jarvis-desktop/bin/whatsapp-bridge
#   2. Templates $HOME into the plist and installs it to ~/Library/LaunchAgents/.
#   3. Boots out any existing instance, then bootstraps the new one into the
#      GUI login domain so it starts now and on every login.
#
# The bridge is pointed at the SAME store dir the desktop resolves today
# (…/io.hyperpolymath.jarvis-desktop/whatsapp), so the existing paired session
# carries over with ZERO re-pair, and tools/whatsapp-sync/sync.mjs keeps reading
# the same whatsapp.db unchanged.
#
# Usage:
#   tools/whatsapp-bridge/install-daemon.sh
#
# Uninstall:
#   launchctl bootout gui/$(id -u)/com.hyperpolymath.whatsapp-bridge
#   rm ~/Library/LaunchAgents/com.hyperpolymath.whatsapp-bridge.plist

set -euo pipefail

LABEL="com.hyperpolymath.whatsapp-bridge"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

APP_SUPPORT="$HOME/Library/Application Support/io.hyperpolymath.jarvis-desktop"
BIN_DIR="$APP_SUPPORT/bin"
BIN_PATH="$BIN_DIR/whatsapp-bridge"
STORE_DIR="$APP_SUPPORT/whatsapp"

LAUNCH_AGENTS="$HOME/Library/LaunchAgents"
PLIST_SRC="$SCRIPT_DIR/$LABEL.plist"
PLIST_DEST="$LAUNCH_AGENTS/$LABEL.plist"

UID_NUM="$(id -u)"
DOMAIN="gui/$UID_NUM"

log() { printf '[install-daemon] %s\n' "$*"; }

# ── 1. Build the bridge binary to the stable path ─────────────────────────────
if ! command -v go >/dev/null 2>&1; then
  echo "[install-daemon] error: 'go' not found on PATH — install Go and re-run." >&2
  exit 1
fi

mkdir -p "$BIN_DIR" "$STORE_DIR"
log "building bridge → $BIN_PATH"
( cd "$SCRIPT_DIR" && GOOS=darwin GOARCH=arm64 go build -o "$BIN_PATH" . )
chmod +x "$BIN_PATH"

# ── 2. Install the plist (template $HOME in) ──────────────────────────────────
if [ ! -f "$PLIST_SRC" ]; then
  echo "[install-daemon] error: plist template missing at $PLIST_SRC" >&2
  exit 1
fi
mkdir -p "$LAUNCH_AGENTS"
log "installing plist → $PLIST_DEST"
# Fill the __HOME__ placeholder with the real home dir. Using | as the sed
# delimiter avoids clashing with the / in the path.
sed "s|__HOME__|$HOME|g" "$PLIST_SRC" > "$PLIST_DEST"

# ── 3. (Re)bootstrap the agent, idempotently ──────────────────────────────────
# Bootout any prior instance first so a re-run reloads the fresh plist/binary.
# bootout fails loudly if the label isn't loaded, which is fine on a first run;
# swallow that so the script stays idempotent.
if launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; then
  log "booting out existing $LABEL"
  launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
fi

log "bootstrapping $LABEL into $DOMAIN"
launchctl bootstrap "$DOMAIN" "$PLIST_DEST"
# Kickstart to guarantee it's running right now (RunAtLoad handles login boots).
launchctl kickstart -k "$DOMAIN/$LABEL" || true

log "done. logs: /tmp/whatsapp-bridge.out.log  /tmp/whatsapp-bridge.err.log"
log "verify: curl -sS http://localhost:8080/api/health"
