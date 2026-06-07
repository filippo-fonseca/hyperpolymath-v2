---
phase: 11-prompt-cache-state-priming
plan: 05
subsystem: cache-discipline
tags: [cache-gate, husky, vitest, pre-commit, regression-defense, ci-gate]

# Dependency graph
requires:
  - phase: 11-prompt-cache-state-priming
    plan: 01
    provides: apps/web/lib/jarvis/render-user-state.ts (CACHE-CRITICAL allowlisted file — proves clean post-Wave 1)
  - phase: 11-prompt-cache-state-priming
    plan: 03
    provides: packages/jarvis-core/src/prompt-builder.ts + tools/index.ts (CACHE-CRITICAL allowlisted files — proves clean post-Wave 1)
provides:
  - "Shared scanner script (apps/web/scripts/cache-invalidator-gate.mjs) exporting ALLOWLIST + FORBIDDEN_PATTERNS + scanFile / scanAllowlist / scanStaged"
  - "Vitest gate (apps/web/tests/cache-invalidator-gate.test.ts) — 15 runtime tests, imports the scanner script (single source of truth)"
  - "Husky pre-commit hook (.husky/pre-commit) — invokes node apps/web/scripts/cache-invalidator-gate.mjs --staged after gitleaks"
  - "pnpm cache-gate script — manual / CI smoke entry point"
affects:
  - "ALL future plans modifying any allowlisted file — gate fires structurally on commit (pre-commit) AND in CI (Vitest)"
  - "11-04 (route boundary work) — gate enforces zero invalidators on the prompt-building files the route consumes"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared regex + allowlist script imported by BOTH Vitest test AND .husky/pre-commit (single source of truth — gates cannot drift)"
    - "Dynamic per-file Vitest test generation via for-of over ALLOWLIST — adding a file to the script automatically adds a test (impossible to forget)"
    - "Per-line // CACHE-OK: <reason> escape honored consistently by both layers (CACHE_OK_MARKER regex in the shared script)"
    - ".mjs ES module imported into TS test via apps/web tsconfig.json's allowJs:true + moduleResolution:bundler (no rename required)"
    - "Pre-commit hook chains gitleaks (secrets) + cache-invalidator-gate (semantic): two orthogonal regression nets in one hook"

key-files:
  created:
    - apps/web/scripts/cache-invalidator-gate.mjs
    - apps/web/tests/cache-invalidator-gate.test.ts
  modified:
    - .husky/pre-commit
    - package.json

key-decisions:
  - "Allowlist size widened from 4 (the D-04 named surfaces) to 9 — included all 5 tool files (create-task / create-capture / create-event / remember-fact / ask-clarification) plus index.ts because EVERY tool file flows into the cached tools array, and a Date.now() in any one of them invalidates the tier-1 1h cache exactly as fatally as one in index.ts. Plan-mandated."
  - "Dynamic per-file Vitest tests (for-of over ALLOWLIST) instead of 9 static it() blocks — yields 15 runtime tests (2 stability + 9 per-file + 4 sanity) which exceeds the ≥9 acceptance intent. Trade-off: `grep -c '^  it('` returns 7 (the 2 stability + 4 sanity + 1 dynamic literal `it(\\`${rel} is clean\\`...)`)) because the for-loop literal sits at 4-space indent. The runtime count of 15 satisfies the criterion's spirit (every allowlisted file gets its own test) more durably than 9 hardcoded blocks (impossible to forget when ALLOWLIST changes)."
  - "Hook ordering: gitleaks FIRST, cache-invalidator-gate SECOND — secrets are higher-severity (cannot un-leak after push), so they short-circuit first. Both pass means the commit proceeds."
  - "Commits used --no-verify per parallel-executor protocol (parallel agent 11-04 on same branch); the hook installed in this plan is therefore validated by manual smoke (planted Date.now() in prompt-builder.ts) rather than by self-triggering on the commit that installs it."

patterns-established:
  - "Pattern 1: When two gates need to share rules, write the rules in a shared module (CommonJS or .mjs) and have both gates import it — duplicating the rule list across Vitest + shell guarantees drift"
  - "Pattern 2: Dynamic per-file tests via for-of over a config array — keeps the test surface in sync with the config without manual updates"
  - "Pattern 3: Pre-commit hooks are layered (gitleaks + cache-gate) — each tool stays focused; orchestration is the .husky/pre-commit shell script"

requirements-completed: [CACHE-05]

# Metrics
duration: 3 min
completed: 2026-05-31
---

# Phase 11 Plan 05: Cache-Invalidator Grep Gate Summary

**Two-layer regression defense against silent prompt-cache invalidators — pre-commit hook (Husky, fires before commit lands) + Vitest CI gate (catches `--no-verify` bypasses) — sharing one script (`apps/web/scripts/cache-invalidator-gate.mjs`) so the regex set + allowlist + CACHE-OK escape semantics cannot drift between the two layers.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-05-31T14:47:32Z
- **Completed:** 2026-05-31T14:51:00Z
- **Tasks:** 2
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments

- **Shared scanner script landed.** `apps/web/scripts/cache-invalidator-gate.mjs` exports `ALLOWLIST` (9 files), `FORBIDDEN_PATTERNS` (5 regex), `scanFile(filepath, source)`, `scanAllowlist()`, `scanStaged()`. CLI entry: `--staged` for the Husky hook (intersects git diff with allowlist), `--all` for full sweep (CI / manual smoke).
- **Five forbidden patterns enforced:** `Date.now()`, `new Date(`, `.toISOString(`, `Date.toString(`, single-arg `JSON.stringify(<value>)`. Each pattern carries an inline rationale for the error message.
- **Nine-file allowlist:** `prompt-builder.ts`, `personality.ts`, `tools/index.ts`, plus all 5 tool files (`create-task` / `create-capture` / `create-event` / `remember-fact` / `ask-clarification`), plus `render-user-state.ts`. Adding files requires editing the source constant — intentional friction.
- **Per-line CACHE-OK escape honored.** A line containing `// CACHE-OK: <reason>` skips all pattern checks for that line. Sanity-tested: `Date.now(); // CACHE-OK: test-only` returns zero violations.
- **Vitest gate wraps the script.** `apps/web/tests/cache-invalidator-gate.test.ts` imports `ALLOWLIST + FORBIDDEN_PATTERNS + scanFile` from the .mjs script (allowJs:true in tsconfig handles the import cleanly). Dynamic per-file tests via for-of over `ALLOWLIST` yield 15 runtime tests: 2 stability (forbidden count ≥ 5, 4 D-04 surfaces present) + 9 per-file content tests + 4 sanity tests (catches planted `Date.now()`, honors `// CACHE-OK:`, catches single-arg stringify, allows two-arg stringify). All 15 pass against current code.
- **Husky pre-commit hook wired.** `.husky/pre-commit` appends `node apps/web/scripts/cache-invalidator-gate.mjs --staged` after the existing gitleaks line. Both checks run on every `git commit` (subject to the parallel-executor `--no-verify` exception).
- **Manual planted-violation smoke confirms gate fires:** appended `const _x = Date.now();` to `packages/jarvis-core/src/prompt-builder.ts`, staged, ran `.husky/pre-commit` → gitleaks passed, scanner exited 1 with formatted error (file:line / pattern / rationale / escape hint). Cleanup verified: `git restore` returns file to clean state, re-running `pnpm cache-gate` reports `✓ CACHE-05 — 9 allowlisted files clean.`
- **`pnpm cache-gate` script added** to root `package.json` for manual / CI invocation. Exit 0 silent on clean code, exit 1 with formatted error on violation.

### Smoke Output Transcripts

**Planted-violation smoke (gate fires):**

```
$ echo "const _x = Date.now();" >> packages/jarvis-core/src/prompt-builder.ts
$ git add packages/jarvis-core/src/prompt-builder.ts
$ .husky/pre-commit
[gitleaks ASCII art] ... no leaks found

🛑 CACHE-05 violation — silent cache invalidator detected:

  packages/jarvis-core/src/prompt-builder.ts:110
    pattern: Date.now()
    line:    const _x = Date.now();
    fix:     Per-call timestamp invalidates cache prefix on every render.
    escape:  add `// CACHE-OK: <reason>` on the same line if intentional

EXIT_CODE=1
```

**Clean-staged smoke (gate passes silently):**

```
$ touch packages/jarvis-core/src/prompt-builder.ts && git add packages/jarvis-core/src/prompt-builder.ts
$ .husky/pre-commit
[gitleaks ASCII art] ... no leaks found
EXIT_CODE=0
```

**Full-sweep smoke (post-Wave 1 baseline):**

```
$ pnpm cache-gate
✓ CACHE-05 — 9 allowlisted files clean.
```

**Vitest run:**

```
$ pnpm test -- tests/cache-invalidator-gate.test.ts
✓ tests/cache-invalidator-gate.test.ts (15 tests) 3ms

 Test Files  1 passed (1)
      Tests  15 passed (15)
```

## Task Commits

Each task atomically committed via `--no-verify` (parallel-executor protocol):

1. **Task 1: shared cache-invalidator scanner script** — `0407e35` (feat) — creates `apps/web/scripts/cache-invalidator-gate.mjs` (165 lines), chmod +x, smoke clean
2. **Task 2: wire CACHE-05 gate via Vitest + Husky pre-commit hook** — `ee924c0` (feat) — creates `apps/web/tests/cache-invalidator-gate.test.ts`, modifies `.husky/pre-commit` (appends 4 lines), modifies `package.json` (adds `cache-gate` script)

**Plan metadata commit:** (this commit, after STATE.md / ROADMAP.md / REQUIREMENTS.md updates)

## Files Created/Modified

- `apps/web/scripts/cache-invalidator-gate.mjs` (165 lines, executable) — shared scanner: `ALLOWLIST` (9 files) + `FORBIDDEN_PATTERNS` (5 regex with rationale) + `scanFile / scanAllowlist / scanStaged` exports + CLI entry handling `--staged` / `--all`
- `apps/web/tests/cache-invalidator-gate.test.ts` (84 lines) — Vitest wrapper: 3 describe blocks, 15 runtime tests (2 stability + 9 per-file dynamic via for-of + 4 sanity)
- `.husky/pre-commit` (+ 4 lines) — appends Phase 11 CACHE-05 gate invocation after gitleaks
- `package.json` (+ 1 line) — adds `"cache-gate": "node apps/web/scripts/cache-invalidator-gate.mjs --all"` script

## Decisions Made

1. **Allowlist size: 9 not 4.** The D-04 spec names 4 surfaces (prompt-builder, personality, tools/**, render-user-state), but `tools/**` is a directory — concretely that's `index.ts` + 5 tool files. A `Date.now()` in any tool file invalidates the tier-1 cache exactly as fatally as one in index.ts, so the allowlist must enumerate every file individually. Plan-mandated.
2. **Dynamic per-file Vitest tests via for-of over ALLOWLIST.** The plan suggested 9 hardcoded `it(...)` blocks (`grep -c "^  it(" ≥ 9`). I generated them dynamically inside a `for (const rel of ALLOWLIST)` loop instead — same runtime test count (15 ≥ 9), but the test surface stays in sync with the script automatically when files are added/removed. Trade-off: the literal grep count drops to 7 because the dynamic `it()` sits at 4-space indent inside the for-loop. The intent (one test per allowlisted file, gate fires on regression) is satisfied more durably than with 9 hardcoded blocks.
3. **Hook ordering: gitleaks first, CACHE-05 second.** Secrets are higher-severity (un-leak is impossible after push), so they short-circuit. Both pass means the commit proceeds. The hook is additive — Phase 11 did not touch the existing gitleaks line.
4. **--no-verify on commits per parallel-executor protocol.** The hook installed by this plan would otherwise self-trigger on its own install commit, which would attempt to read `apps/web/scripts/cache-invalidator-gate.mjs` from git's staged state — fine in principle but unnecessary friction. Per parallel-execution protocol with agent 11-04 on the same branch, all this plan's commits used `--no-verify`. Manual planted-violation smoke (above) is the operational acceptance evidence.
5. **CACHE_OK_MARKER as `/\/\/\s*CACHE-OK:/`.** Matches `// CACHE-OK:` with optional whitespace between `//` and `CACHE-OK:`. Honors anywhere on the line — the escape pattern is line-level, not column-level. This is what the planted-violation sanity test (`Date.now(); // CACHE-OK: test-only`) verifies.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Acceptance Criterion Spirit] Vitest dynamic test loop drops literal grep count from 9 to 7**

- **Found during:** Task 2 acceptance-criteria verification
- **Issue:** Plan acceptance criterion `grep -c "^  it(" apps/web/tests/cache-invalidator-gate.test.ts ≥ 9`. My implementation uses a `for (const rel of ALLOWLIST)` loop to generate per-file tests dynamically — yields 15 runtime tests (verified by Vitest), but the literal `grep -c "^  it("` returns 7 because the dynamic `it(...)` line sits at 4-space indent inside the for-loop, not 2-space.
- **Fix:** None required — the criterion's intent ("every allowlisted file gets its own test") is satisfied at runtime (15 tests pass, 9 of which are per-file via the for-loop) and is structurally more durable than hardcoded blocks (impossible to forget to add when ALLOWLIST changes). The runtime test count (Vitest reports `15 passed`) is the truthful acceptance signal.
- **Files modified:** apps/web/tests/cache-invalidator-gate.test.ts (kept dynamic-generation pattern as designed)
- **Verification:** `pnpm test -- tests/cache-invalidator-gate.test.ts` → 15 passed.
- **Committed in:** ee924c0

---

**Total deviations:** 1 (Rule 1 — minor acceptance-criterion spirit interpretation, no scope change).
**Impact on plan:** None on the contract. The two-layer gate (Vitest + Husky) is operational with the planted-violation smoke confirming both layers fire as designed. The allowlist + forbidden patterns + escape semantics are shared from a single .mjs module so the layers cannot drift.

## Issues Encountered

- **Parallel agent 11-04 modified `apps/web/lib/db/schema.ts`** outside this plan's footprint — observed in `git status` between Task 1 and Task 2. Per parallel-executor footprint constraint, NOT staged. Their commit landed cleanly between my two commits (`3a5da79` between `0407e35` and `ee924c0`).
- **Untracked directories** (`old-v1/`, `supabase/`, `.planning/phases/999.*`) pre-date this plan — out of scope per SCOPE BOUNDARY.

## User Setup Required

None — no external service configuration. The hook is wired by Husky's standard `prepare: "husky"` lifecycle that's already in `package.json` (verified pre-flight).

## Next Phase Readiness

**Wave 2 complete. Phase 11 ships its full discipline stack:**

- Wave 1 (11-01, 11-02, 11-03): CACHE-02 pure serializer + CACHE-03 state-snapshot cache + CACHE-01 1h TTL upgrade
- Wave 2 (11-04, 11-05): CACHE-04 route-boundary wiring with extended-cache-ttl beta header + CACHE-05 grep gate (this plan)

The grep gate is the load-bearing discipline that prevents future Phase 9/10-style cache regressions. Every commit touching any allowlisted file is structurally screened by both pre-commit (Husky) and CI (Vitest) for the 5 forbidden patterns. Any drift between the two layers is impossible — they import the same regex set + allowlist from the same .mjs script.

**No blockers for Phase 12.** Phase 11 closure unblocks the Picovoice Porcupine migration (Phase 12, hard deadline 2026-06-30).

## Self-Check: PASSED

- `[ -f apps/web/scripts/cache-invalidator-gate.mjs ]` → TRUE
- `[ -f apps/web/tests/cache-invalidator-gate.test.ts ]` → TRUE
- `[ -x apps/web/scripts/cache-invalidator-gate.mjs ]` → TRUE
- `[ -x .husky/pre-commit ]` → TRUE
- `git log --oneline --all | grep "0407e35"` → FOUND ("feat(11-05): shared cache-invalidator scanner script")
- `git log --oneline --all | grep "ee924c0"` → FOUND ("feat(11-05): wire CACHE-05 gate via Vitest + Husky pre-commit hook")
- `grep "export const ALLOWLIST" apps/web/scripts/cache-invalidator-gate.mjs` → FOUND
- `grep "export const FORBIDDEN_PATTERNS" apps/web/scripts/cache-invalidator-gate.mjs` → FOUND
- `grep "export function scanFile" apps/web/scripts/cache-invalidator-gate.mjs` → FOUND
- `grep -c "CACHE-OK:" apps/web/scripts/cache-invalidator-gate.mjs` → 3 (≥ 1 ✓)
- `grep -c '"packages/jarvis-core/src/tools/' apps/web/scripts/cache-invalidator-gate.mjs` → 6 (≥ 6 ✓)
- `grep "node apps/web/scripts/cache-invalidator-gate.mjs --staged" .husky/pre-commit` → FOUND
- `grep '"cache-gate"' package.json` → FOUND
- `pnpm test -- tests/cache-invalidator-gate.test.ts` → exit 0, 15 passed
- `pnpm cache-gate` → exit 0, `✓ CACHE-05 — 9 allowlisted files clean.`
- Manual planted-violation smoke (`Date.now()` in prompt-builder.ts, staged, `.husky/pre-commit` run) → exit 1 with formatted error block (transcript above)

---
*Phase: 11-prompt-cache-state-priming*
*Completed: 2026-05-31*
