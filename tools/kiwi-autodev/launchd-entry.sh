#!/usr/bin/env bash
#
# The single command launchd invokes. It sources config.sh, runs the gate, and
# only on gate success execs node run.mjs. A failing gate is the normal idle
# path (not an error), so we exit 0 quietly in that case to keep launchd happy.
set -euo pipefail

# Resolve this script's own directory so the worker runs from anywhere.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=config.sh
source "${SCRIPT_DIR}/config.sh"

# Run the eligibility gate. If it fails, the worker is simply idle: exit 0.
if ! "${SCRIPT_DIR}/gate.sh"; then
  exit 0
fi

# Gate passed: hand off to the orchestrator. exec replaces this process so the
# launchd job tracks run.mjs directly.
cd "${SCRIPT_DIR}"
exec node run.mjs
