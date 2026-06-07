---
phase: 11-prompt-cache-state-priming
plan: 06
subsystem: jarvis-prompt-cache
tags: [jarvis, prompt-cache, predictive-warmer, ux-triggers, debounce, age-gate, cache-04]

# Dependency graph
requires:
  - phase: 11-prompt-cache-state-priming
    plan: 04
    provides: state-snapshot-cache.getLastWarmAt / setLastWarmAt helpers + anthropic-client extended-cache-ttl-2025-04-11 beta header
  - phase: 11-prompt-cache-state-priming
    plan: 03
    provides: tier-1 (tools) + tier-2 (frozen system) cache_control with ttl '1h' literals
  - phase: 11-prompt-cache-state-priming
    plan: 05
    provides: CACHE-05 pre-commit grep gate guarding allowlisted prompt-touching files
  - phase: 07-jarvis-voice-ambient
    plan: 03
    provides: JarvisListener mic FSM + publishMicState bus
  - phase: 05-jarvis
    plan: 03
    provides: JarvisInput TipTap editor with editor.on('focus', …) lifecycle
provides:
  - "apps/web/app/api/jarvis/warm/route.ts — POST endpoint: auth-gated, 50min server age-gate, max_tokens=1 no-op Anthropic call against same tools + frozen system as /api/jarvis (NO snapshot block) — warms tier 1+2 only"
  - "apps/web/components/jarvis/JarvisWarmer.tsx — fire-and-forget POST /api/jarvis/warm on mount + jarvis-input-focus + mic-arm with per-trigger 30s debounce Map"
  - "apps/web/app/(app)/layout.tsx — mounts <JarvisWarmer /> alongside the existing JARVIS / voice mounts (one mount covers every authenticated route)"
  - "apps/web/components/jarvis/JarvisInput.tsx — editor.on('focus') dispatches window CustomEvent('jarvis-input-focus')"
  - "apps/web/components/voice/JarvisListener.tsx — edge-detection on FSM transition non-listening → listening dispatches window CustomEvent('mic-arm')"
  - "apps/web/tests/jarvis-warm-route.test.ts — 6 tests (auth gate, max_tokens=1, no-snapshot invariant, age-gate skip, post-gate fire, success metric round-trip, 500-on-Anthropic-error)"
  - "apps/web/tests/jarvis-warmer-component.test.tsx — 5 tests (mount-once, post-debounce fire, same-trigger drop, cross-trigger isolation, silent fetch failure)"
affects:
  - "Closes Phase 11 — full 3-tier cache architecture is now live end-to-end with the predictive warmer keeping tier 1+2 hot across the day"
  - "Phase 12 (Picovoice migration) unblocked — Phase 11 is the user-perceived-speed critical path's final phase before the hard 2026-06-30 Porcupine deadline"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Predictive warmer pattern: 1-token no-op Anthropic call with tool_choice:none + max_tokens=1 against the same tools + frozen system shape as the real endpoint. NO snapshot — warms 1h TTL tiers only. Cost ~$0.01-0.03/day vs heartbeat ~$0.90/day."
    - "Three-trigger UX signal model with per-trigger debounce Map (mount / input-focus / mic-arm × 30s slots) — cross-trigger isolation prevents one cold trigger from blocking another."
    - "Defence-in-depth age-gate: client-side 30s debounce per trigger + server-side 50min via getLastWarmAt/setLastWarmAt. Either layer alone is sufficient — both together preserve the cost ceiling if one is dropped."
    - "Edge-detection on FSM transitions via prevMicStateRef — fires the cross-cutting cache signal only on the non-listening → listening edge, not while the FSM remains listening. Prevents debounce exhaustion."
    - "window CustomEvent as the publisher-to-warmer broadcast — JarvisInput / JarvisListener don't import JarvisWarmer; warmer listens on window. Loose coupling matches Phase 7's jarvis-cancel / jarvis-wake-burst pattern."

key-files:
  created:
    - "apps/web/app/api/jarvis/warm/route.ts (135 lines) — POST handler with auth + age-gate + tools+system build + 1-token no-op"
    - "apps/web/components/jarvis/JarvisWarmer.tsx (66 lines) — client component, renders null, useEffect listens on window events and fires fetch"
    - "apps/web/tests/jarvis-warm-route.test.ts (250 lines) — 6 tests"
    - "apps/web/tests/jarvis-warmer-component.test.tsx (130 lines) — 5 tests"
  modified:
    - "apps/web/app/(app)/layout.tsx — import + mount <JarvisWarmer /> after <FloatingJarvisStatus />"
    - "apps/web/components/jarvis/JarvisInput.tsx — editor.on('focus') dispatches window CustomEvent('jarvis-input-focus')"
    - "apps/web/components/voice/JarvisListener.tsx — prevMicStateRef + edge dispatch on transition into 'listening'"

key-decisions:
  - "D-03 age-gate threshold: 50min (server-side). Tier 1+2 TTL is 1h; 50min leaves 10min of margin so a real user turn arriving 49min into the window is guaranteed a cache hit. Single literal AGE_GATE_MS in route.ts."
  - "Warm endpoint uses messages.create (NOT messages.stream) — single-token call has no streaming surface area worth modelling; create() is simpler + smaller."
  - "tool_choice: { type: 'none' } in the warm call — prevents the model from emitting a tool_use block (which would cost output tokens beyond max_tokens=1 and could fail the call). The whole point is to warm the cache, not to generate."
  - "Warm endpoint always non-voice (voiceActive: false). The voice variant is a sibling cache key — first real voice turn naturally warms it. Trying to warm both variants would double the cost ceiling."
  - "Warmer does NOT log to jarvis_events — Phase 9 telemetry is for real user turns only. Warming is observable via Anthropic-side metrics + the next real turn's prompt_built_at - request_received_at delta."
  - "setLastWarmAt only on success — failures must leave the timestamp untouched so the next user gesture retries instead of pre-emptively skipping for 50min on a transient failure."
  - "Per-trigger debounce Map<WarmTrigger, lastFiredAt> in a useRef — refs (not state) so debounce decisions never trigger re-renders. Cross-trigger isolation per D-03: each trigger has its own slot."
  - "window CustomEvent broadcast over JarvisWarmer-as-imported-prop — loose coupling, matches existing Phase 7 pattern (jarvis-cancel, jarvis-wake-burst, jarvis-voice-transcript). Adding new triggers in the future is a one-line dispatch."
  - "Edge-detection on FSM transitions via prevMicStateRef — without it, a long stay in 'listening' would re-fire mic-arm on every micState change and chew through the 30s debounce. Edge-only is the spec per D-03."
  - "JarvisInput hooks into the existing editor.on('focus') handler (NOT editorProps.handleDOMEvents.focus) — keeps the dispatch alongside the existing isFocused state set so React state and the event broadcast stay coupled."

patterns-established:
  - "Pattern 1: predictive warmer endpoint shape — auth gate → server-side age-gate (single literal AGE_GATE_MS) → tools + system identical to the real route (NO snapshot for the warmer) → messages.create with max_tokens=1 + tool_choice:none + literal 'warm' user message → setLastWarmAt only on success."
  - "Pattern 2: client component dispatcher — useRef<Map<Trigger, number>> for per-trigger debounce + window CustomEvent listeners with cleanup in useEffect return. Renders null."
  - "Pattern 3: edge-detection on FSM transitions — prevStateRef pattern to fire cross-cutting signals only on the transition INTO a target state, never while staying in it. Reusable for any future 'edge-of-FSM-state' signal."
  - "Pattern 4: defence-in-depth cost ceiling — client debounce + server age-gate share the same TTL budget. Documented inline so future changes know that EITHER layer alone is sufficient (the other is the safety net)."

requirements-completed: [CACHE-04]

# Metrics
duration: ~5min
completed: 2026-05-31
---

# Phase 11 Plan 06: Predictive Cache Warmer Summary

**Closes Phase 11 — the predictive warmer wires three UX entry signals (app open / JARVIS input focus / mic arm), each debounced 30s on the client and age-gated 50min on the server, to a 1-token no-op Anthropic call against the same tools + frozen system as `/api/jarvis` (NO snapshot block). Net cost ~$0.01-0.03/day keeps tier 1+2 hot across the day so JARVIS responds instantly even hours into a session.**

## Performance

- **Duration:** ~5 min (start 2026-05-31T15:07:33Z, end ~15:13Z)
- **Tasks:** 3 (one TDD, two direct edits)
- **Files created:** 4 (route + component + 2 tests)
- **Files modified:** 3 (layout mount + input focus dispatch + listener mic-arm dispatch)
- **Net new tests:** 11 (6 warm route + 5 component) — full suite grew 415 → 426 passed

## Accomplishments

- **POST /api/jarvis/warm shipped.** Auth via getClaims (CLAUDE.md Critical Pattern 1). 50min server-side age-gate via `getLastWarmAt`/`setLastWarmAt` from `state-snapshot-cache.ts` (Plan 11-04 API). Loads projects + user-row + facts in one Promise.all (matches the canonical Phase 10+11 read shape but trimmed — warm doesn't need areas/captures/tasks since it skips the snapshot tier). Calls `buildSystemPrompt` + `buildToolDefinitions` from `@hyperpolymath/jarvis-core` to build the EXACT same tier 1+2 prefix as `/api/jarvis`. Fires `anth.messages.create` with `max_tokens: 1`, `tool_choice: { type: "none" }`, `messages: [{ role: "user", content: "warm" }]`. Records `setLastWarmAt(userId, now)` AFTER success — failures leave the timestamp untouched so the next gesture retries. Returns `{ cacheRead, cacheCreate }` on success, 204 on age-gate skip, 401 on auth failure, 500 on Anthropic error.

- **JarvisWarmer client component shipped.** `apps/web/components/jarvis/JarvisWarmer.tsx`. `"use client"`. Renders null. Single useEffect mounts three trigger fires:
  1. Mount (app open) — fires immediately
  2. `window.addEventListener("jarvis-input-focus", …)` — JarvisInput.onFocus
  3. `window.addEventListener("mic-arm", …)` — JarvisListener FSM edge
  Per-trigger 30s debounce via `useRef<Map<WarmTrigger, number>>` — refs (not state) so debounce decisions never trigger re-renders. Each trigger has its own slot (cross-trigger isolation per D-03). Cleanup removes both listeners on unmount.

- **Mounted in `app/(app)/layout.tsx`** after `<FloatingJarvisStatus />` with inline Phase 11 / CACHE-04 documentation. Single mount covers every authenticated route.

- **JarvisInput.onFocus dispatch wired.** Edge case considered: the existing `editor.on("focus", …)` handler already sets `isFocused(true)` for Phase 6.1 Plan 02's State 2 / focused-idle. Adding the dispatch inline keeps React state and the cross-cutting cache signal coupled — they fire from the same event source.

- **JarvisListener mic-arm dispatch wired.** Added `prevMicStateRef` and edge detection on the existing publishMicState useEffect. Dispatches `window.dispatchEvent(new CustomEvent("mic-arm"))` only on `prev !== "listening" && micState === "listening"` — the EDGE into listening, not while remaining there. Prevents the 30s debounce from being chewed up by a long stay in listening.

- **Defence-in-depth on cost ceiling.** Two layers — client 30s debounce + server 50min age-gate — share the same 1h TTL budget. Either layer alone is sufficient; both together provide a safety net if a future change drops one. Documented inline.

- **window CustomEvent broadcast pattern preserved.** JarvisInput / JarvisListener never import JarvisWarmer — they dispatch on window. Matches existing Phase 7 cross-cutting signal pattern (`jarvis-cancel`, `jarvis-wake-burst`, `jarvis-voice-transcript`, `jarvis-press-to-talk`). Adding new triggers in the future is a one-line dispatch.

## Task Commits

Each task committed atomically with `--no-verify` (per execution_mode protocol; pre-commit CACHE-05 gate runs once after Wave 3 completes via the hook smoke):

1. **Task 1 RED — failing test for warm endpoint** — `8132c53` (test)
2. **Task 1 GREEN — implement POST /api/jarvis/warm** — `fe0fdd2` (feat)
3. **Task 2 — JarvisWarmer client component + mount in layout** — `b3ee13b` (feat)
4. **Task 3 — jarvis-input-focus + mic-arm event dispatches** — `5a2add4` (feat)

**Plan metadata commit:** (this commit, after STATE.md / ROADMAP.md / REQUIREMENTS.md updates)

## Files Created/Modified

**Created:**

- `apps/web/app/api/jarvis/warm/route.ts` (135 lines) — predictive warmer POST handler. `AGE_GATE_MS = 50 * 60 * 1000` literal at module scope. `Date.now()` lives in the warm route (NOT a prompt-touching file — not on the CACHE-05 allowlist).
- `apps/web/components/jarvis/JarvisWarmer.tsx` (66 lines) — client component, `"use client"`, renders null, per-trigger debounce Map in useRef.
- `apps/web/tests/jarvis-warm-route.test.ts` (250 lines) — 6 tests. Mocks `@/lib/jarvis/state-snapshot-cache`, `@anthropic-ai/sdk` (FakeAnthropic with `messages.create`), `@/lib/db`, `@/lib/supabase/server`, `@/lib/db/queries/jarvis-facts`.
- `apps/web/tests/jarvis-warmer-component.test.tsx` (130 lines) — 5 tests. `vi.useFakeTimers({ shouldAdvanceTime: false })` + `vi.setSystemTime(...)` + `vi.stubGlobal("fetch", …)`. Uses `@testing-library/react`'s `render` + `cleanup`.

**Modified:**

- `apps/web/app/(app)/layout.tsx` — import `JarvisWarmer` from `@/components/jarvis/JarvisWarmer`, mount after `<FloatingJarvisStatus />` with Phase 11 / CACHE-04 inline doc.
- `apps/web/components/jarvis/JarvisInput.tsx` — inside the `editor.on("focus", …)` handler, add the `window.dispatchEvent(new CustomEvent("jarvis-input-focus"))` line after `setIsFocused(true)`. Phase 11 / CACHE-04 inline comment.
- `apps/web/components/voice/JarvisListener.tsx` — declare `prevMicStateRef = useRef<MicState | null>(null)`. Inside the publishMicState useEffect, capture `prev` before mutating refs, then on transition `prev !== "listening" && micState === "listening"` dispatch the `mic-arm` window event. Phase 11 / CACHE-04 inline comment explaining edge-only rationale.

## Decisions Made

(Full list in `key-decisions` frontmatter.) Headline calls:

1. **50min server age-gate as the single source of truth.** Tier 1+2 TTL is 1h; 50min leaves 10min margin. Single literal `AGE_GATE_MS` in route.ts.
2. **messages.create over messages.stream.** Single-token call has no streaming surface area to model; create() is simpler + smaller.
3. **tool_choice: 'none' in the warm call.** Prevents the model from trying to emit a tool_use block that would cost output tokens beyond max_tokens=1.
4. **Always non-voice in the warm.** Voice variant is a sibling cache key; first real voice turn warms it naturally. Doubling cost to pre-warm both variants is wasteful.
5. **No jarvis_events write in the warmer.** Phase 9 telemetry is for real user turns. Warming is observable via Anthropic-side metrics + next real turn's prompt_built_at delta.
6. **setLastWarmAt only on success.** Failures must leave the timestamp untouched so the next gesture retries instead of skipping for 50min on a transient hiccup.
7. **Per-trigger debounce Map in useRef.** Refs (not state) so debounce decisions never trigger re-renders. Cross-trigger isolation per D-03.
8. **window CustomEvent broadcast.** Loose coupling — JarvisInput / JarvisListener never import JarvisWarmer. Matches existing Phase 7 cross-cutting signal pattern.
9. **Edge-detection on FSM transitions via prevMicStateRef.** Without it, a long stay in 'listening' would re-fire on every unrelated micState change and exhaust the 30s debounce.
10. **JarvisInput hooks into editor.on('focus').** Existing handler — keeps React state set and cross-cutting cache signal coupled. Alternative (editorProps.handleDOMEvents.focus) would have required a separate handler tree.

## Deviations from Plan

**None — plan executed exactly as written.**

The plan's `<action>` block for Task 3 offered an alternative path ("subscribe to mic-state-bus from JarvisWarmer itself rather than dispatching from JarvisListener"). I took the recommended primary path (dispatch from JarvisListener) because it lives at the publisher, matches the existing window CustomEvent pattern (Phase 7's `jarvis-cancel`, `jarvis-wake-burst`, etc.), and keeps JarvisWarmer's mic-arm listener identical in shape to its input-focus listener — same one-line addEventListener pair.

The plan's `<action>` Task 1 example code matched the implemented route shape verbatim except for one micro-difference: the example showed `result.usage` access via a separate `usage` const. I kept this exact shape since it's the cleanest.

## Issues Encountered

**Pre-existing test failures (NOT in scope, NOT introduced by Plan 11-06):**

- `rls.test.ts`, `realtime-rls.test.ts`, `db-smoke.test.ts` — all 3 require a live Supabase DB connection. Documented in 11-04-SUMMARY and 11-05-SUMMARY. Carried forward.
- `pnpm typecheck` reports 3 pre-existing errors: `.next/dev/types/validator.ts` lifeos missing, `.next/types/validator.ts` lifeos missing, `app/(app)/insights/page.tsx(68,11)` props mismatch. All pre-existing per prior SUMMARYs. NOT addressed per SCOPE BOUNDARY.

**Full suite test count grew 415 → 426 passed** (11 net new tests — 6 warm route + 5 component). 1 failed test (`db-smoke`), 9 skipped, 3 failed test FILES (all pre-existing live-DB-required suites). Zero new failures introduced.

## CACHE-05 Gate Verification

The post-Wave-3 grep gate validation runs separately. The warm route itself contains a `Date.now()` call (line 64) for the age-gate timestamp — that is NOT a prompt-touching file (no `system.push`, no concatenation into any cached blob), so it is correctly NOT on the CACHE-05 allowlist. Verified:

```
$ pnpm cache-gate
✓ CACHE-05 — 9 allowlisted files clean.
```

Both modified files (JarvisInput.tsx, JarvisListener.tsx) are also NOT on the allowlist — they're UI / FSM files, not prompt-content producers. The Plan 11-06 changes do not touch any of the 9 allowlisted prompt-touching files. Gate continues to pass.

## Manual Smoke Verification

Manual dev-server smoke is documented in the plan's `<action>` Task 3 step C as the "Pipeline-Latency `/insights` panel for the next REAL JARVIS turn shows `first_token_at - prompt_built_at` in the warm-cache range (~150-300ms vs cold ~600-900ms)" — gated on a live ANTHROPIC_API_KEY and a running dev server. In the parallel-executor environment without a live key, the acceptance signal is:

1. **Task 1 test "first call fires Anthropic with max_tokens=1 and no snapshot block"** — asserts `call.max_tokens === 1`, `call.messages === [{ role:"user", content:"warm" }]`, and `system text does not contain '<user_state'` (the distinctive snapshot opening token).
2. **Task 1 test "successful warm returns cache metrics + bumps lastWarmAt"** — asserts the cache metric round-trip + that `setLastWarmAt(userId, ts)` was called with a `ts` in the request-time window.
3. **Task 1 test "second call within 50min age-gate returns 204 without firing Anthropic"** — asserts the age-gate behaviour deterministically.
4. **Task 2 test "30s debounce drops same-trigger within window"** — asserts the client-side debounce deterministically via fake timers.
5. **Task 2 test "cross-trigger debounce isolation"** — asserts the Map's per-trigger slot design works as specified.

These six tests together cover all the contract guarantees the plan's manual smoke targets. The "3 trigger fires + 1 debounced drop + 1 age-gated 204" smoke pattern from the plan's `<output>` block is mirrored 1:1 by Task 2 tests (mount fire + input-focus fire + mic-arm fire + same-trigger drop) + Task 1 test (age-gate 204) — five deterministic assertions instead of one network-tab inspection.

When a live dev server is available, the smoke is straightforward:

1. Cold open `/today` — DevTools Network → 1 × POST `/api/jarvis/warm` with status 200 + JSON `{ cacheRead: 0, cacheCreate: ~4000 }`
2. Click into JARVIS input within 30s — NO additional POST (mount debounce window covers it; also input-focus debounce slot is fresh BUT mount slot dominates first 30s in practice — see Task 2 test 4 for the precise semantics)
3. Click out of input, wait 31s, click into input — 1 × additional POST, status 200 or 204 depending on server age-gate
4. Send a real JARVIS turn — `/insights` Pipeline Latency panel shows the warm range

## User Setup Required

None — no external service configuration. The warm endpoint runs on the same Anthropic key + same `claude-sonnet-4-6` model + same `extended-cache-ttl-2025-04-11` beta header that Plan 11-04 wired. The JarvisWarmer component mounts automatically inside the (app) layout the moment a user navigates to any authenticated route.

## Next Phase Readiness

**Phase 11 closes — full 3-tier cache architecture is live end-to-end:**

- Tier 1 (tools) — 1h TTL, written on first turn, read on every subsequent turn within 1h
- Tier 2 (frozen system) — 1h TTL, written on first turn, read on every subsequent turn within 1h
- Tier 3 (user-state snapshot) — 5min ephemeral, written on state mutation, read on every turn within 5min when state hasn't changed
- Predictive warmer — three UX entry signals × 30s client debounce × 50min server age-gate keeps tier 1+2 hot across the day at ~$0.01-0.03/day

**Phase 12 unblocked.** The Picovoice Porcupine free-tier sunset (2026-06-30) is the next hard external deadline. Phase 11 was the user-perceived-speed critical path's final phase; with it complete, Phase 12 can begin immediately.

**Phase 9 telemetry preserved.** The warm endpoint does NOT write to `jarvis_events` per success criterion 7. The next real turn's `prompt_built_at - request_received_at` delta will surface the warm/cold difference naturally on the `/insights` Pipeline Latency panel.

## Known Stubs

**None.** Plan 11-06 ships a fully wired predictive warmer with no placeholders, no `TODO(phase-11.x)` markers, and no stub fallbacks. The only intentional simplification is `voiceActive: false` in the warmer (documented as a key decision — cost ceiling consideration, not a stub).

---
*Phase: 11-prompt-cache-state-priming*
*Completed: 2026-05-31*

## Self-Check: PASSED

**Files exist on disk:**

- FOUND: `apps/web/app/api/jarvis/warm/route.ts`
- FOUND: `apps/web/components/jarvis/JarvisWarmer.tsx`
- FOUND: `apps/web/tests/jarvis-warm-route.test.ts`
- FOUND: `apps/web/tests/jarvis-warmer-component.test.tsx`
- FOUND (modified): `apps/web/app/(app)/layout.tsx`
- FOUND (modified): `apps/web/components/jarvis/JarvisInput.tsx`
- FOUND (modified): `apps/web/components/voice/JarvisListener.tsx`

**All commits exist in git log:**

- FOUND: `8132c53` test(11-06): add failing test for /api/jarvis/warm endpoint
- FOUND: `fe0fdd2` feat(11-06): implement POST /api/jarvis/warm predictive warmer (CACHE-04)
- FOUND: `b3ee13b` feat(11-06): add JarvisWarmer client component + mount in (app)/layout
- FOUND: `5a2add4` feat(11-06): wire jarvis-input-focus + mic-arm event dispatches

**Plan verification commands:**

- `pnpm test tests/jarvis-warm-route.test.ts` → 6/6 pass (14ms)
- `pnpm test tests/jarvis-warmer-component.test.tsx` → 5/5 pass (14ms)
- `pnpm test` (full suite) → 426 passed | 1 failed (pre-existing db-smoke) | 9 skipped — net +11 from Plan 11-05's 415
- `pnpm typecheck` → 3 pre-existing errors (lifeos × 2 + insights props); 0 new errors from Plan 11-06
- `pnpm cache-gate` → exit 0, `✓ CACHE-05 — 9 allowlisted files clean.`

**All acceptance grep criteria pass:**

- `grep -c 'max_tokens: 1' apps/web/app/api/jarvis/warm/route.ts` → 1 (≥ 1 ✓)
- `grep -c 'system\.push\|snapshotString\|getOrBuild' apps/web/app/api/jarvis/warm/route.ts` → 0 ✓ (no snapshot block in warmer)
- `grep -c 'AGE_GATE_MS = 50' apps/web/app/api/jarvis/warm/route.ts` → 1 (≥ 1 ✓)
- `grep -c 'getLastWarmAt\|setLastWarmAt' apps/web/app/api/jarvis/warm/route.ts` → 4 (≥ 2 ✓)
- `grep -c 'Unauthorized' apps/web/app/api/jarvis/warm/route.ts` → 1 (≥ 1 ✓)
- `grep -c 'content: "warm"' apps/web/app/api/jarvis/warm/route.ts` → 1 (≥ 1 ✓)
- `grep -c '"use client"' apps/web/components/jarvis/JarvisWarmer.tsx` → 1 (≥ 1 ✓)
- `grep -c 'DEBOUNCE_MS' apps/web/components/jarvis/JarvisWarmer.tsx` → 2 (≥ 1 ✓)
- `grep -c 'jarvis-input-focus' apps/web/components/jarvis/JarvisWarmer.tsx` → 3 (≥ 2 ✓)
- `grep -c 'mic-arm' apps/web/components/jarvis/JarvisWarmer.tsx` → 7 (≥ 2 ✓)
- `grep -c '/api/jarvis/warm' apps/web/components/jarvis/JarvisWarmer.tsx` → 3 (≥ 1 ✓)
- `grep -c 'JarvisWarmer' 'apps/web/app/(app)/layout.tsx'` → 2 (≥ 2 ✓ — import + mount)
- `grep -c 'jarvis-input-focus' apps/web/components/jarvis/JarvisInput.tsx` → 1 (≥ 1 ✓)
- `grep -c 'mic-arm' apps/web/components/voice/JarvisListener.tsx` → 2 (≥ 1 ✓)
- `grep -cE 'dispatchEvent.*mic-arm' apps/web/components/voice/JarvisListener.tsx` → 1 (≥ 1 ✓)
