---
phase: 09-latency-telemetry-baseline
plan: 01
subsystem: telemetry
tags: [jarvis, anthropic, sse, supabase, drizzle, prompt-cache, vitest]

requires:
  - phase: 05-jarvis
    provides: jarvisEvents table, logJarvisEvent fire-and-forget writer, /api/jarvis SSE route, jarvis-stream-client SSE consumer
  - phase: 05.1-jarvis-agentic-refactor
    provides: 5-tool definitions with cache_control on ask_clarification (LAST tool), JarvisFact shape
  - phase: 07-jarvis-voice-ambient
    provides: /api/jarvis/stt Groq Whisper proxy, JarvisListener mic FSM, jarvis-voice-transcript CustomEvent

provides:
  - 8 new nullable timestamptz columns on jarvis_events (vad_end_at, stt_done_at, prompt_built_at, first_token_at, last_token_at, tool_loop_done_at, tts_first_byte_at, audio_first_play_at)
  - Drizzle schema mirroring all 8 columns on jarvisEvents pgTable
  - JarvisEventInput.stages block + JarvisEventInput.id (load-bearing for Plan 09-02 beacon)
  - logJarvisEvent maps every stage to its column; absent fields write null
  - 5 server-side stage timestamps captured in /api/jarvis (sttDoneAt, promptBuiltAt, firstTokenAt, lastTokenAt, toolLoopDoneAt)
  - SSE `event: turn-start` event with crypto.randomUUID() turnId emitted as the LITERAL FIRST statement of start(controller) — BEFORE anth.messages.stream
  - x-jarvis-stt-done-at response header on /api/jarvis/stt
  - JarvisListener reads STT response header + forwards via jarvis-voice-transcript detail.sttDoneAt
  - jarvis-stream-client.ts onTurnStart callback + sttDoneAt 5th param + X-Jarvis-Stt-Done-At request header
  - Both transcript consumers (GlobalJarvisHandler + JarvisConsole) forward sttDoneAt
  - tests/jarvis-prompt-stability.test.ts — STRUCTURAL byte-identity guard on buildSystemPrompt + buildToolDefinitions
  - tests/jarvis-cache-hit.test.ts — mocked write-path canary + live-mode (ANTHROPIC_LIVE=true) end-to-end Anthropic round-trip

affects:
  - Plan 09-02 (voice-stage beacon + /insights panel) — reads turnId from onTurnStart, UPDATEs jarvis_events by id, queries the 8 new columns
  - Phase 11 (Prompt Cache + State Priming) — prompt-stability test is the regression guard for cache-control changes
  - Phase 7 closeout (VOICE-13 SLO assertion) — telemetry on prompt_built_at..audio_first_play_at unblocks p50/p95 budget enforcement

tech-stack:
  added: []
  patterns:
    - "Per-stage timestamp pattern — `Date | null` instances flowing through optional `stages` block on telemetry writer; columns nullable so non-applicable stages write null without schema constraint violation"
    - "Turn correlation pattern — server generates turnId at request entry, emits as SSE `turn-start` (LITERAL first statement of start(controller)), pins via JarvisEventInput.id for post-hoc UPDATEs by id (Plan 09-02 beacon)"
    - "STT timestamp round-trip — server captures stt_done_at, returns as response header, client reads + forwards as request header on the subsequent /api/jarvis POST, server stamps into stages.sttDoneAt"
    - "Three-layer prompt-cache regression net — structural byte-identity (source-level) + mocked write-path canary (CI) + live-mode real-Anthropic (on-demand). Each layer catches a different invalidator class"
    - "SSE event name hyphen tolerance — both production parser AND test helper updated from `\\w+` to `[\\w-]+` so multi-word event names (turn-start) survive parsing"

key-files:
  created:
    - apps/web/supabase/migrations/0017_jarvis_event_stage_timestamps.sql
    - apps/web/tests/jarvis-cache-hit.test.ts
    - apps/web/tests/jarvis-prompt-stability.test.ts
  modified:
    - apps/web/lib/db/schema.ts
    - apps/web/lib/jarvis/log-event.ts
    - apps/web/app/api/jarvis/route.ts
    - apps/web/app/api/jarvis/stt/route.ts
    - apps/web/components/voice/JarvisListener.tsx
    - apps/web/components/jarvis/jarvis-stream-client.ts
    - apps/web/components/jarvis/GlobalJarvisHandler.tsx
    - apps/web/components/jarvis/JarvisConsole.tsx
    - apps/web/tests/jarvis-route.test.ts

key-decisions:
  - "Migration 0017 is additive-only — 8 nullable timestamptz columns appended to jarvis_events. Existing Phase 5 telemetry write path keeps working unchanged because `stages` is optional on JarvisEventInput"
  - "JarvisEventInput.id added as optional — when present, insert pins the row id; absent falls back to defaultRandom(). Plan 09-02's beacon endpoint UPDATEs by this id (turnId is the correlation key, not a fresh DB-side uuid)"
  - "SSE `event: turn-start` lives as the LITERAL FIRST statement inside start(controller) — BEFORE anth.messages.stream(...). Verified by ordering grep: turn-start enqueue at line 324, messages.stream at line 326. Ordering is load-bearing because a fast Anthropic response could otherwise emit contentBlock before turn-start lands"
  - "SSE event name regex `\\w+` was a production bug — dropped `turn-start` silently. Fixed in both jarvis-stream-client.ts (production) and the readSseEvents test helper to `[\\w-]+` (Rule 1 auto-fix)"
  - "STT timestamp round-trip via HTTP headers (x-jarvis-stt-done-at response → X-Jarvis-Stt-Done-At request) — keeps the client-server contract explicit, avoids embedding stamps in JSON bodies, NaN-safe via Number.isFinite guard"
  - "Both GlobalJarvisHandler AND JarvisConsole transcript handlers forward sttDoneAt. Updating only one would silently drop the STT timestamp on the 'wrong' route (whichever wasn't updated). Verified: both have 5+ sttDoneAt mentions"
  - "Three-layer TEL-03 defense replaces the original single mocked test (which couldn't fail unless someone edited the mock). Structural identity catches Date.now()/random/unsorted-stringify AT SOURCE in packages/jarvis-core. Mocked write-path proves /api/jarvis still THREADS cache_read_input_tokens through. Live-mode (ANTHROPIC_LIVE=true) is the end-to-end safety net for regressions inside the SDK request body"
  - "Import @hyperpolymath/jarvis-core (main barrel) NOT @jarvis-core/prompt-builder — the workspace package only exports `.`, `./tools`, `./parsers` (not a per-file subpath). Main barrel re-exports buildSystemPrompt + buildFactsBlock + buildToolDefinitions, so a single import suffices"
  - "JarvisFact fixture in prompt-stability test uses `{ type, key, value }` only (no id/source) — that's the real public shape from packages/jarvis-core/src/types.ts:68. The DB row has id/source/created_at, but those are stripped before injection into the cached system prompt"

patterns-established:
  - "Per-stage telemetry pattern: source captures `new Date()` at the natural boundary → passes through optional `stages` block on logJarvisEvent → maps to nullable timestamptz column. Future phases can extend with new stages without breaking existing callers"
  - "Turn correlation pattern: turnId issued server-side at request entry, emitted FIRST via SSE, persisted as the row id, available client-side via onTurnStart callback. Sets the foundation for any future server↔client correlation needs (Plan 09-02 beacon, voice-stage UPDATEs, future row-level Realtime subscriptions on jarvis_events)"
  - "Prompt-cache regression net pattern: byte-identity test (source) + write-path canary (CI) + live end-to-end (on-demand). Reusable for any future cached LLM artifact (Phase 11 will add a grep gate as the 4th layer)"

requirements-completed: [TEL-01, TEL-03]

duration: 13min
completed: 2026-05-29
---

# Phase 9 Plan 01: Latency Telemetry Server-Side + TEL-03 Regression Net Summary

**Per-stage jarvis_events schema + 5 server-captured timestamps + turnId SSE handshake + 3-layer prompt-cache regression guard**

## Performance

- **Duration:** 13 min
- **Started:** 2026-05-29T15:27:36Z
- **Completed:** 2026-05-29T15:40:30Z (approximate)
- **Tasks:** 3
- **Files modified:** 9 (3 created, 6 modified including 1 test file extension)
- **Tests:** 47 passed + 1 skipped (live-mode) across the full TEL-related sweep

## Accomplishments

- **Migration 0017** appends 8 nullable timestamptz columns to `jarvis_events` (LLM-stage: `prompt_built_at`, `first_token_at`, `last_token_at`, `tool_loop_done_at` — always populated; voice-only: `vad_end_at`, `stt_done_at`, `tts_first_byte_at`, `audio_first_play_at` — populated when applicable)
- **Server-side capture**: `/api/jarvis` now captures 5 of those stamps live (the 4 LLM-stage + `stt_done_at` from the round-trip header), emits `event: turn-start` SSE with a UUID `turnId` as the FIRST frame, pins `logJarvisEvent({ id: turnId, ... })` so Plan 09-02's beacon can UPDATE by id
- **STT round-trip wiring**: `/api/jarvis/stt` returns `x-jarvis-stt-done-at` response header → `JarvisListener` reads it → forwards via `jarvis-voice-transcript` detail → both `GlobalJarvisHandler` + `JarvisConsole` forward into `streamJarvis` → `X-Jarvis-Stt-Done-At` request header on next `/api/jarvis` POST
- **`jarvis-stream-client.ts`** gains `onTurnStart` callback + 5th positional `sttDoneAt` param + `turn-start` SSE branch (placed BEFORE `text` branch in the parser)
- **TEL-03 three-layer defense** ships: structural byte-identity guard on `buildSystemPrompt` + `buildToolDefinitions`, mocked write-path canary, live-mode (`ANTHROPIC_LIVE=true`) real-Anthropic round-trip
- **Bug fix (Rule 1)**: SSE event name regex `\w+` silently dropped `turn-start` in production. Fixed in both `jarvis-stream-client.ts` and the `readSseEvents` test helper to `[\w-]+`

## Task Commits

1. **Task 1: Migration 0017 + Drizzle schema + log-event.ts writer extension** — `c64caff` (feat)
2. **Task 2: /api/jarvis capture sites + turn-start SSE event + STT proxy header round-trip** — `5086024` (feat)
3. **Task 3: TEL-03 regression guard — structural + mocked write-path + live real-API tests** — `360fb43` (test)

**Plan metadata commit:** _(added after this SUMMARY lands)_

## Files Created/Modified

### Created

- `apps/web/supabase/migrations/0017_jarvis_event_stage_timestamps.sql` — 8 ADD COLUMN IF NOT EXISTS statements, all timestamptz, all nullable. Additive only.
- `apps/web/tests/jarvis-cache-hit.test.ts` — TEL-03 mocked write-path canary (CI default, 1 test) + live-mode end-to-end Anthropic round-trip (skipped unless `ANTHROPIC_LIVE=true`, 1 test). Uses `vi.doUnmock("@anthropic-ai/sdk") + dynamic import` to bypass the top-of-file SDK mock for the live block.
- `apps/web/tests/jarvis-prompt-stability.test.ts` — TEL-03 STRUCTURAL guard. 6 tests asserting byte-identical `JSON.stringify` output of `buildSystemPrompt` + `buildToolDefinitions` across two successive identical calls (voiceActive both true and false, facts populated + empty). One test snapshots tool order and verifies `cache_control` is on `ask_clarification` (the LAST tool per Phase 5.1 D-A1).

### Modified

- `apps/web/lib/db/schema.ts` — 8 new timestamp columns appended to `jarvisEvents` pgTable (vadEndAt, sttDoneAt, promptBuiltAt, firstTokenAt, lastTokenAt, toolLoopDoneAt, ttsFirstByteAt, audioFirstPlayAt), all `timestamp(..., { withTimezone: true })`, no `.notNull()`.
- `apps/web/lib/jarvis/log-event.ts` — Added `JarvisStageTimestamps` interface + extended `JarvisEventInput` with optional `stages` + optional `id`. Writer maps each stage field to its column (defaults to `null`); `id` pins the row id when provided (otherwise falls back to `defaultRandom()`).
- `apps/web/app/api/jarvis/route.ts` — Generates `turnId = crypto.randomUUID()` at entry, captures `promptBuiltAt_d` right before opening the `ReadableStream`, captures `firstTokenAt_d` on first `contentBlock`/`text`, refreshes `lastTokenAt_d` on every text delta, captures `toolLoopDoneAt_d` AFTER `Promise.allSettled(pendingActions)`. Reads `X-Jarvis-Stt-Done-At` request header (NaN-guarded). Emits `event: turn-start\ndata: {"turnId":"<uuid>"}\n\n` as the LITERAL FIRST statement of `start(controller)` — BEFORE `anth.messages.stream(...)`. Both success-path + error-path `logJarvisEvent` calls populate the `stages` block and pin `id: turnId`.
- `apps/web/app/api/jarvis/stt/route.ts` — Captures `sttDoneAtMs = Date.now()` right before returning the transcript; emits `x-jarvis-stt-done-at: <epoch ms>` response header.
- `apps/web/components/voice/JarvisListener.tsx` — Reads `x-jarvis-stt-done-at` off the STT response (NaN-guarded via `Number.isFinite`), forwards through the `jarvis-voice-transcript` CustomEvent detail field `sttDoneAt`.
- `apps/web/components/jarvis/jarvis-stream-client.ts` — Added `JarvisTurnStartEvent` interface + `onTurnStart?` callback on `JarvisCallbacks`. Added 5th positional param `sttDoneAt: number | null = null` to `streamJarvis`. Conditionally appends `X-Jarvis-Stt-Done-At` header when `sttDoneAt != null && Number.isFinite(sttDoneAt)`. Added `turn-start` branch in SSE parser BEFORE the `text` branch. Updated event-name regex from `\w+` to `[\w-]+` (Rule 1 bug fix).
- `apps/web/components/jarvis/GlobalJarvisHandler.tsx` — Extracted `sttDoneAt` from `event.detail`, forwarded to `streamJarvis` as the 5th positional arg. Preserved existing voiceActive=false default (Phase 7 polish item out of scope).
- `apps/web/components/jarvis/JarvisConsole.tsx` — Added `sttDoneAt` to `handleSubmit`'s `opts` parameter; transcript listener extracts `detail.sttDoneAt` and forwards through `handleSubmit → streamJarvis`.
- `apps/web/tests/jarvis-route.test.ts` — Extended `buildRequest` helper with `sttDoneAt?: number` option. Extended existing telemetry test to assert `stages.promptBuiltAt` is a Date and `id` is a UUID string (back-compat preserved — all original assertions kept). Added new describe block `POST /api/jarvis — turn-start SSE event (Phase 9 / TEL-01)` (2 tests: UUID shape + turnId↔logJarvisEvent.id correlation). Added new describe block `POST /api/jarvis — stage timestamps (Phase 9 / TEL-01)` (3 tests: monotonic 4-stage ordering + STT header round-trip + null fallback). Updated `readSseEvents` event-name regex to `[\w-]+`.

## SSE turn-start Event Shape (load-bearing for Plan 09-02)

```
event: turn-start
data: {"turnId":"<uuid-v4>"}

```

**Placement:** LITERAL first statement inside `start(controller)` in `apps/web/app/api/jarvis/route.ts:324`, BEFORE `anth.messages.stream(...)` at line 326. Verified by automated ordering check (`awk` comparison of line numbers). If a future refactor moves this enqueue after the Anthropic SDK call, a fast Anthropic response could enqueue `contentBlock` before `turn-start` and clients would see the LLM event before the handshake — breaking Plan 09-02's beacon correlation.

## HTTP Header Contract (load-bearing for Plan 09-02)

| Direction | Endpoint | Header | Format | Notes |
|---|---|---|---|---|
| Response | `POST /api/jarvis/stt` | `x-jarvis-stt-done-at` | `String(Date.now())` — epoch ms | Always set on 200 response |
| Request | `POST /api/jarvis` | `X-Jarvis-Stt-Done-At` | `String(<epoch ms>)` | Optional; absent → `stages.sttDoneAt = null` |

NaN/non-finite values are coerced to `null` on the server side (`!Number.isNaN(sttDoneAt_d.getTime()) ? sttDoneAt_d : null`) — telemetry never breaks user flow.

## Surface Area Plan 09-02 Will Consume

1. **`onTurnStart({ turnId })`** callback on `JarvisCallbacks` — client subscribes to capture the row id at stream start
2. **`JarvisEventInput.id`** — Plan 09-02's beacon endpoint accepts a turnId + voice-stage timestamps, performs `UPDATE jarvis_events SET vad_end_at = ?, tts_first_byte_at = ?, audio_first_play_at = ? WHERE id = $turnId`
3. **The 3 voice-only timestamp columns** (`vad_end_at`, `tts_first_byte_at`, `audio_first_play_at`) are already in the schema, awaiting their client-side capture sites + beacon writer
4. **Aggregator query layer** can immediately read `prompt_built_at..tool_loop_done_at` for text-turn telemetry without waiting on Plan 09-02 — the LLM-stage columns are populated on every turn from now on

## TEL-03 Defense Layers

| Layer | File | Mode | Catches |
|---|---|---|---|
| Structural identity | `tests/jarvis-prompt-stability.test.ts` | CI default | `Date.now()` / `new Date()` / `Math.random()` / `crypto.randomUUID()` / unsorted `JSON.stringify` over Set/Map / non-deterministic tool order INSIDE `packages/jarvis-core` |
| Write-path canary | `tests/jarvis-cache-hit.test.ts` (mocked) | CI default | Regressions where `/api/jarvis` stops THREADING `cache_read_input_tokens` through to `logJarvisEvent` |
| Live end-to-end | `tests/jarvis-cache-hit.test.ts` (live) | `ANTHROPIC_LIVE=true` on demand | Regressions inside the SDK request body itself or any future refactor that bypasses `packages/jarvis-core` entirely |

Each layer has a distinct failure message hint pointing to `.planning/research/speed-agility/05-context-priming.md §8` for audit. Phase 11 (Prompt Cache + State Priming) will add a 4th layer — a grep gate per CACHE-05.

## Decisions Made

See `key-decisions` frontmatter section above for the 9 substantive decisions made during execution.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] SSE event-name regex `\w+` silently dropped `turn-start` event**
- **Found during:** Task 2 (test failure: first emitted SSE event came through as empty string)
- **Issue:** Both `jarvis-stream-client.ts` (production) and `readSseEvents` (test helper) used `chunk.match(/^event: (\w+)$/m)`. `\w` is `[A-Za-z0-9_]`, which excludes hyphens. So `event: turn-start` matched 0 chars and the event name resolved to `""`. Plan 09-02 would have silently failed to receive any turn-start events.
- **Fix:** Changed both regexes to `chunk.match(/^event: ([\w-]+)$/m)` — adds hyphen tolerance.
- **Files modified:** `apps/web/components/jarvis/jarvis-stream-client.ts`, `apps/web/tests/jarvis-route.test.ts`
- **Verification:** Test "first emitted SSE event is `turn-start` with a UUID turnId" passes; existing tests covering single-word event names (`text`, `action`, `done`, `error`, `queued`, `clarification`) continue to pass.
- **Committed in:** `5086024` (part of Task 2 commit)

**2. [Rule 2 - Missing Critical] JarvisEventInput.id field**
- **Found during:** Task 1 / Task 2 (implementing the turnId correlation path)
- **Issue:** Plan calls for `logJarvisEvent({ id: turnId, ... })` so Plan 09-02's beacon can UPDATE by id, but the existing `JarvisEventInput` didn't have an `id` field. Without it, every row would get a fresh `defaultRandom()` uuid and the turnId emitted via SSE would be uncorrelated with any DB row — Plan 09-02 would be unable to write voice-stage timestamps back.
- **Fix:** Added `id?: string` to `JarvisEventInput` (optional — preserves Phase 5 callers). Writer spreads `...(input.id ? { id: input.id } : {})` so omission falls back to `defaultRandom()`.
- **Files modified:** `apps/web/lib/jarvis/log-event.ts`, `apps/web/app/api/jarvis/route.ts`
- **Verification:** New test "turn-start event id matches the logJarvisEvent id (correlation key for Plan 09-02 beacon)" passes — the UUID in the SSE turn-start event equals `call.id` in the telemetry call.
- **Committed in:** `c64caff` (Task 1 interface) + `5086024` (Task 2 call sites)

---

**Total deviations:** 2 auto-fixed (1 production bug, 1 missing critical field)
**Impact on plan:** Both auto-fixes essential — without #1, Plan 09-02's beacon correlation would silently break in production despite the test passing. Without #2, the entire turnId correlation contract is purely cosmetic (no DB row to UPDATE). Zero scope creep.

## Issues Encountered

- **JarvisFact fixture shape mismatch (test wrote-then-fixed):** Initial draft of the prompt-stability fixture had `{ id, type, key, value, source }` per the plan's example. Real `JarvisFact` interface at `packages/jarvis-core/src/types.ts:68` is `{ type, key, value }` only (id/source are server-side, stripped before prompt injection). Corrected fixture to match — types now resolve cleanly + tests pass.
- **Workspace package import path:** Plan suggested `@jarvis-core/prompt-builder` and `@jarvis-core/tools` as candidate import paths. Actual `@hyperpolymath/jarvis-core` package only exports `.`, `./tools`, `./parsers` (not a per-file subpath). Used the main barrel `@hyperpolymath/jarvis-core` — re-exports `buildSystemPrompt` + `buildFactsBlock` + `buildToolDefinitions` so a single import covers everything.

## User Setup Required

None — no external service configuration needed for this plan.

**Note for Plan 09-02 or future migration runs:** When migration 0017 is applied (via `supabase migration up` or `drizzle-kit migrate`), the 8 new columns are added as nullable so existing rows remain valid. No data backfill required.

## Self-Check: PASSED

- All 12 listed files exist on disk
- All 3 task commits present in git log (`c64caff`, `5086024`, `360fb43`)
- All 47 + 1 skipped tests pass across the TEL-related sweep
- `pnpm tsc --noEmit` exits 0
- CRITICAL ordering verified: turn-start enqueue at line 324, messages.stream at line 326

## Next Phase Readiness

- **Plan 09-02 is unblocked.** It can:
  - Add `useTurnId` / subscribe to `onTurnStart` in voice components
  - Add `audio_first_play_at` capture in `audio-queue.ts` + `tts_first_byte_at` in `use-tts-player.ts` + `vad_end_at` in `JarvisListener.tsx`
  - Create `/api/jarvis/telemetry/voice-stages` beacon endpoint that `UPDATE jarvis_events WHERE id = $turnId`
  - Add the Pipeline Latency panel to `/insights` ABOVE the existing Phase 6 charts
  - Add a `getStageLatencyStats(userId, sinceMinutes, stage)` helper to `lib/db/queries/analytics.ts`
- **Phase 11 (Prompt Cache + State Priming)** has its regression guard ready. Any future PR touching `packages/jarvis-core/src/prompt-builder.ts` or `tools/index.ts` will fail the structural test if it introduces a silent cache invalidator. Phase 11's planned CACHE-05 grep gate becomes the 4th defense layer (after structural + write-path canary + live).

---
*Phase: 09-latency-telemetry-baseline*
*Completed: 2026-05-29*
