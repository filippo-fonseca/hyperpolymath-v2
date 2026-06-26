#!/usr/bin/env bash
# SessionStart hook: keep the Mac fully awake for the duration of the session,
# per the global "Session setup" rule. Asserts display, system, and disk wake
# (caffeinate -dimsu) so the device never sleeps while work is in progress.
#
# Detached and idempotent: caffeinate is launched with nohup + disown and its
# I/O redirected so it outlives this hook (the hook returns immediately and
# never blocks session start). A pidfile guards against stacking duplicate
# processes when several sessions open at once.
#
# Fails open and quiet: macOS-only (caffeinate ships with macOS); on any other
# platform, or if caffeinate is missing, it exits 0 with no output.
set -uo pipefail

command -v caffeinate >/dev/null 2>&1 || exit 0

PIDFILE="${TMPDIR:-/tmp}/claude-keep-awake.pid"

# If a previously launched caffeinate is still alive, do nothing.
if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE" 2>/dev/null)" 2>/dev/null; then
  exit 0
fi

# Launch detached so it outlives this hook, and record its pid for the guard.
nohup caffeinate -dimsu >/dev/null 2>&1 &
echo $! > "$PIDFILE"
disown 2>/dev/null || true

exit 0
