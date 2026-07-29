#!/usr/bin/env bash
# Keep a dev server alive on a fixed port for the length of a verification run.
#
# The server on this machine gets SIGTERM'd from outside at unpredictable points
# (no crash, no memory pressure: it exits cleanly mid-run). A verification lane
# cannot tell that apart from an app defect unless the server comes back on its
# own, so this restarts it and stamps every restart into the log. The stamps are
# the audit trail: if a measurement straddles a restart, the log says so.
#
# Usage: supervise-dev.sh <appdir> <port> <logfile>
set -u
APPDIR="$1"; PORT="$2"; LOG="$3"
cd "$APPDIR" || exit 1
: > "$LOG"
while true; do
  echo "=== [supervisor] starting dev server on ${PORT} at $(date -u +%Y-%m-%dT%H:%M:%SZ) ===" >> "$LOG"
  pnpm exec next dev --turbopack --port "$PORT" >> "$LOG" 2>&1
  echo "=== [supervisor] dev server exited rc=$? at $(date -u +%Y-%m-%dT%H:%M:%SZ) ===" >> "$LOG"
  sleep 2
done
