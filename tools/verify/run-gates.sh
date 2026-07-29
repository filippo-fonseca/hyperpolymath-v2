#!/usr/bin/env bash
# Final-integration gate runner. Writes each gate's verbatim output to the
# evidence directory and prints an exit code line the report can quote.
set -u
EV="$1"
mkdir -p "$EV"

pnpm typecheck > "$EV/gate-typecheck.txt" 2>&1
echo "TYPECHECK_EXIT=$?" | tee -a "$EV/gate-typecheck.txt"

pnpm build > "$EV/gate-build.txt" 2>&1
echo "BUILD_EXIT=$?" | tee -a "$EV/gate-build.txt"

pnpm test > "$EV/gate-tests.txt" 2>&1
echo "TEST_EXIT=$?" | tee -a "$EV/gate-tests.txt"

pnpm --filter web exec tsc -p ../../tsconfig.verify.json > "$EV/gate-verify-typecheck.txt" 2>&1
echo "VERIFY_TC_EXIT=$?" | tee -a "$EV/gate-verify-typecheck.txt"

echo "GATES_DONE"
