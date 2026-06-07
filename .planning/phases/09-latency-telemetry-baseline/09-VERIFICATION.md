---
status: human_needed
phase: 09-latency-telemetry-baseline
verified: 2026-05-29
verifier: inline (gsd-verifier agent timed out; orchestrator ran grep-checkable verification directly)
plans_complete: 2/2
requirements: [TEL-01, TEL-02, TEL-03]
---

# Phase 9: Latency Telemetry Baseline — Verification

## Status: human_needed

All code-checkable must-haves verified (8/8 dimensions pass). Real-world voice-turn end-to-end smoke requires a live signed-in session — captured below as human verification items.

## Goal Achievement

**Phase goal:** "Make every stage of the voice-end-to-audio-out pipeline individually measurable in production, so the rest of v1.1 is engineering rather than guesswork."

**Achieved:** Yes — structurally. The 8 per-stage timestamps are wired at every capture site, the beacon endpoint accepts client-side stages, the aggregator computes p50/p95 per stage, the panel renders on /insights, and the regression guards (structural + mocked + live) defend against silent prompt-cache invalidation in Phase 11.

**Validation gap:** The end-to-end "user speaks → 8 columns populate → panel renders real numbers" loop has not been executed against a running dev server. Captured as HUMAN-UAT.

## Must-Haves Verified

### TEL-01 — Per-stage timestamps (PASS)

| Check | Method | Result |
|---|---|---|
| Migration 0017 adds 8 timestamptz columns | `grep -cE "ADD COLUMN.*(8 col names).*timestamptz"` | 8 ✓ |
| `lib/db/schema.ts` mirrors all 8 columns | grep | 11 refs ✓ |
| `JarvisEventInput` interface has `stages?` block and `id?` field (load-bearing for beacon UPDATE) | file read | both present ✓ |
| `/api/jarvis/route.ts` captures 4 LLM stages | grep | 31 refs across capture + telemetry build ✓ |
| `turn-start` SSE event is LITERAL FIRST statement of `start(controller)` | awk line-number check | start() at line 323, turn-start enqueue at line 324 ✓ |
| `/api/jarvis/stt/route.ts` emits `x-jarvis-stt-done-at` response header | grep | 2 refs (emit + import) ✓ |
| `JarvisListener.tsx` does NOT eagerly `collectStage("vad_end_at")` (race fix) | grep | 0 occurrences ✓ |
| `JarvisListener.tsx` captures `vadEndAt` locally and pipes through CustomEvent detail | grep | 2 occurrences (capture + dispatch) ✓ |
| `GlobalJarvisHandler.tsx` calls `collectStage("vad_end_at", ...)` inside `onTurnStart` after `setActiveTurnId` | grep | 1 occurrence ✓ |
| `JarvisConsole.tsx` parallels the same wiring | grep | 1 occurrence ✓ |
| `use-tts-player.ts` calls `collectStage("tts_first_byte_at", ...)` | grep | 1 occurrence ✓ |
| `audio-queue.ts` calls `collectStage("audio_first_play_at", ...)` | grep | 1 occurrence ✓ |

### TEL-02 — `/insights` Pipeline Latency panel (PASS)

| Check | Method | Result |
|---|---|---|
| `getStageLatencyStats` exists in `lib/db/queries/analytics.ts` | grep | 1 ref ✓ |
| SQL filter uses `or(isNotNull(firstTokenAt), isNotNull(vadEndAt))` to exclude Phase-5-era rows | grep | 1 ref ✓ |
| `PipelineLatencyPanel.tsx` exists | file check | exists ✓ |
| Locked empty-state heading: `"Eight stages, no signal yet."` | `grep -F` | 2 matches (component + test) ✓ |
| Locked empty-state body: `"No voice turns recorded — say \"hey jarvis\" and the timeline lights up."` | `grep -F` | 2 matches ✓ |
| Panel mounted ABOVE existing tabs in `/insights/page.tsx` | line-number check | Panel at line 48, header at 49, InsightsTabs at 67 ✓ |

### TEL-03 — Cache-hit regression guard (PASS)

| Check | Method | Result |
|---|---|---|
| `tests/jarvis-prompt-stability.test.ts` exists with byte-identity assertions on REAL `buildSystemPrompt` + `buildToolDefinitions` exports | file read | Imports from `@hyperpolymath/jarvis-core` (not mocked); 6 structural identity tests ✓ |
| `tests/jarvis-cache-hit.test.ts` mocked write-path canary | file read | `expect(read).toBeGreaterThan(0)` at line 169 ✓ |
| Live-mode test is real (no `expect(live).toBe(true)` placeholder) | file read lines 180-260 | Real Anthropic SDK calls (via `vi.doUnmock`), asserts `cache_creation_input_tokens > 0` on turn 1 AND `cache_read_input_tokens > 0` on turn 2, deterministic 200-line padding fixture (no `Date.now()`, no random) ✓ |
| Live test skipped unless `ANTHROPIC_LIVE=true` | grep | `(live ? it : it.skip)` pattern ✓ |

### Phase 9 SC #4 — Phase 6 /insights non-regression (PASS)

| Check | Method | Result |
|---|---|---|
| `InsightsTabs.tsx` NOT modified by Phase 9 commits | `git diff cf3bcc3 HEAD -- apps/web/components/insights/InsightsTabs.tsx` | empty diff ✓ |

### Beacon route security (PASS)

| Check | Method | Result |
|---|---|---|
| `getClaims()` for auth (not `getSession` or `getUser`) | grep | 2 refs ✓ |
| 2-layer WHERE on UPDATE (`id` + `userId`) | grep | 3 refs ✓ |
| `maxTs = Date.now() + 60_000` computed INSIDE request handler | grep | 3 refs (computation + 3 Zod field uses) ✓ |

### SSE event-name regex hyphen-tolerance (PASS)

| Check | Method | Result |
|---|---|---|
| `jarvis-stream-client.ts` uses `[\w-]+` regex (Wave 1 auto-fix; without it `turn-start` is silently dropped and entire voice-stage correlation breaks) | grep | `/^event: ([\w-]+)$/m` confirmed ✓ |

### Test Suites

| Suite | Result |
|---|---|
| `tests/jarvis-route.test.ts` | PASS (Wave 1 executor confirmed) |
| `tests/jarvis-cache-hit.test.ts` | PASS mocked + 1 skipped live |
| `tests/jarvis-prompt-stability.test.ts` | PASS (6 structural identity tests) |
| `tests/api-jarvis-stt.test.ts` | PASS |
| `tests/jarvis-stream-client.test.ts` | PASS (incl. hyphen-tolerant SSE event parsing) |
| `tests/jarvis-latency.test.ts` | PASS |
| `tests/api-jarvis-telemetry-voice-stages.test.ts` | PASS (12 tests) |
| `tests/voice-stage-collector.test.ts` | PASS (11 tests) |
| `tests/voice-turn-end-to-end.test.ts` | PASS (Wave 2 vad-pre-bind regression guard) |
| **Total** | **118 pass + 2 skipped (ANTHROPIC_LIVE + 1 from base suite)** |
| `pnpm tsc --noEmit` | PASS (clean) |

### Environment notes (do NOT count against Phase 9)

- `pnpm build` fails on PRE-EXISTING user WIP in landing-page (`apps/web/app/twitter-image.tsx`, `components/landing/BuildLog.tsx`, `components/landing/lib/readRoadmap.ts`) — none of these are Phase 9 files. Pre-existing build debt; would fail at any HEAD before Phase 9.
- 3 DB test files (`tests/db-smoke.test.ts`, `tests/rls.test.ts`, `tests/realtime-rls.test.ts`) ECONNREFUSED 127.0.0.1:54322 — local Supabase Docker not running. Pre-existing environment state.
- Working tree has ~26 pre-existing user-WIP M files (landing components, areas tree, habits, etc.). Both executors avoided touching them per the brief.

## Human Verification Required

The following require a running dev server with a signed-in user. Captured as HUMAN-UAT items.

1. **End-to-end voice-turn populates all 8 stage timestamps.**
   - Start dev server, sign in
   - Speak a command (e.g., "hey jarvis, add buy milk")
   - Run `psql ... -c "SELECT id, voice_active, vad_end_at, stt_done_at, prompt_built_at, first_token_at, last_token_at, tool_loop_done_at, tts_first_byte_at, audio_first_play_at FROM jarvis_events ORDER BY created_at DESC LIMIT 1;"`
   - **Expected:** All 8 stage columns NON-NULL on this voice turn (`voice_active = true`).

2. **Text-only JARVIS turn populates only LLM stages.**
   - Type a command in the text Console
   - Same psql query
   - **Expected:** `prompt_built_at`, `first_token_at`, `last_token_at`, `tool_loop_done_at` NON-NULL; `vad_end_at`, `stt_done_at`, `tts_first_byte_at`, `audio_first_play_at` NULL; `voice_active = false`.

3. **/insights renders the new Pipeline Latency panel with real data.**
   - After step 1 lands ≥3 voice turns and ≥3 text turns
   - Visit /insights
   - **Expected:** Pipeline Latency panel is the FIRST element on the page (above existing action-distribution / latency / error-rate charts). Horizontal stacked bar shows non-zero ms per stage. p50/p95 toggle works. 7-day sparklines render below the bar.

4. **/insights empty state for fresh users.**
   - In an empty DB (no jarvis_events rows in 7d), the panel shows:
     - Heading: `Eight stages, no signal yet.`
     - Body: `No voice turns recorded — say "hey jarvis" and the timeline lights up.`

5. **Phase 6 charts continue to render unchanged.**
   - On /insights, scroll past the new panel
   - **Expected:** Action-type distribution, latency p50/p95, error-rate charts (from Phase 6 P04) render and update with no visual or numeric regression.

6. **Beacon endpoint resilience.**
   - With voice on, speak a command, then immediately reload the page mid-TTS
   - **Expected:** No console errors. The partial timestamps the client captured should have been flushed via `navigator.sendBeacon` (it's designed to survive unload).

7. **TEL-03 live-mode regression guard.**
   - Run `ANTHROPIC_LIVE=true ANTHROPIC_API_KEY=... pnpm vitest run apps/web/tests/jarvis-cache-hit.test.ts`
   - **Expected:** Two real Anthropic calls; assertion passes (turn 1 writes cache, turn 2 reads cache).

## Decision Log

- Verifier sub-agent timed out at ~6 minutes after 15 tool calls (orchestrator never received completion signal). Per workflow runtime-compatibility fallback: spot-checked all must-haves inline via grep + file read. All structural verification is complete and grep-pinned in this report.
- Status `human_needed` (not `passed`) because the end-to-end voice-turn → 8-column population loop is best validated against the real running system. All code-level acceptance has been verified.
