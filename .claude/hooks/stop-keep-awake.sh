#!/usr/bin/env bash
# SessionEnd hook: stop the keep-awake caffeinate started by keep-awake.sh, so
# the Mac is only held awake for the lifetime of the session. When the terminal
# session ends, this kills the recorded caffeinate process and clears the
# pidfile.
#
# Fails open and quiet: if no pidfile or the process is already gone, exits 0
# with no output.
set -uo pipefail

PIDFILE="${TMPDIR:-/tmp}/claude-keep-awake.pid"

[ -f "$PIDFILE" ] || exit 0

PID="$(cat "$PIDFILE" 2>/dev/null)"
if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
  kill "$PID" 2>/dev/null || true
fi

rm -f "$PIDFILE" 2>/dev/null || true
exit 0
