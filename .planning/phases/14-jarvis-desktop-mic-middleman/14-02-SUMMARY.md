---
phase: 14-jarvis-desktop-mic-middleman
plan: 02
subsystem: voice-coordination
tags: [voice-source-claim, desktop-mic, SSE, Groq, transcript-dispatch, browser-coordination]
dependency_graph:
  requires: [14-01]
  provides: [voice-source-claim-api, transcript-dispatch-route, browser-desktopClaimed-guard]
  affects: [apps/web/lib/voice/physical-extension, apps/web/app/api/jarvis/voice, apps/web/app/api/jarvis/physical]
tech_stack:
  added: []
  patterns:
    - globalThis HMR-survival scalar for in-memory voice-source claim (mirrors physicalBus pattern)
    - X-Trigger-Secret auth reuse across new routes (no new env vars)
    - physicalBus EventEmitter extended with transcript event type (no new SSE channel)
    - early-return guard on desktopClaimed for browser mic short-circuit
key_files:
  created:
    - apps/web/lib/voice/source-claim.ts
    - apps/web/app/api/jarvis/voice/source/claim/route.ts
    - apps/web/app/api/jarvis/voice/transcript/route.ts
    - apps/web/tests/voice-source-claim.test.ts
    - apps/web/tests/voice-transcript-route.test.ts
    - apps/web/tests/use-physical-extension-desktop-claimed.test.ts
  modified:
    - apps/web/lib/voice/physical-extension/types.ts
    - apps/web/lib/voice/physical-extension/bus.ts
    - apps/web/lib/voice/physical-extension/use-physical-extension.ts
    - apps/web/app/api/jarvis/physical/trigger/route.ts
    - apps/web/app/api/jarvis/physical/events/route.ts
decisions:
  - Voice-source claim uses globalThis._jarvisVoiceSourceLastClaimedAt scalar (single number | null) — simpler than a struct with owner field since single-user app has only one valid owner
  - Extended physicalBus with transcript event type rather than creating a new SSE channel (RESEARCH Pattern 4 confirmed)
  - auth for both new routes reuses PHYSICAL_TRIGGER_SECRET via X-Trigger-Secret header — no new env vars per CONTEXT.md Decision 5
  - desktopClaimed embedded in trigger SSE payload (not a separate browser poll) — atomic, zero round-trips on every wake event (RESEARCH Pattern 5)
  - vi.hoisted() used in transcript route test to avoid mock hoisting TDZ issue with shared mockCreate reference
metrics:
  duration: ~5 min
  completed: 2026-06-06T19:02:55Z
  tasks_completed: 2
  files_created: 6
  files_modified: 5
---

# Phase 14 Plan 02: Voice-Source Claim + Transcript Dispatch Summary

Server-side voice-source claim API (30s TTL in-memory scalar), WAV→Groq transcript dispatch route, physicalBus transcript event extension, browser early-return guard on desktopClaimed, and browser transcript SSE listener — all delivered with 16/16 tests passing.

## What Shipped

### Task 1: Voice-source claim module + POST /api/jarvis/voice/source/claim

`apps/web/lib/voice/source-claim.ts` holds the in-memory voice ownership state as a `globalThis.__jarvisVoiceSourceLastClaimedAt` scalar (number | null). This mirrors the `physicalBus` HMR-survival pattern — the value survives Next.js dev-mode module reloads. TTL is 30,000ms (`SOURCE_CLAIM_TTL_MS`).

`POST /api/jarvis/voice/source/claim` authenticates via `X-Trigger-Secret` header against `PHYSICAL_TRIGGER_SECRET` (the exact same auth pattern as the existing trigger route). Returns `{ ok: true, ttlMs: 30000 }` on success.

### Task 2: Transcript route + physicalBus extension + browser hooks

**types.ts** — `PhysicalTrigger` gains `desktopClaimed?: boolean`. New `PhysicalTranscript` interface exported.

**bus.ts** — `emitPhysicalTranscript(payload: PhysicalTranscript)` helper added alongside `emitPhysicalTrigger`.

**trigger/route.ts** — Every emitted payload now includes `desktopClaimed: getVoiceSourceStatus().claimed`. Arduino bridge payloads automatically carry `desktopClaimed: false` when no desktop heartbeat is fresh — zero regressions.

**events/route.ts** — SSE stream subscribes to both `"trigger"` and `"transcript"` bus events and forwards each as a separate `event: <name>` block. Cleanup handler calls `physicalBus.off` for both. No new SSE channel introduced.

**voice/transcript/route.ts** — Accepts WAV body (max 25MB), authenticates via `X-Trigger-Secret`, calls Groq `whisper-large-v3-turbo` (same model as existing `/api/jarvis/stt`), emits `physicalBus.emit("transcript", {...})` on success. Returns `{ transcript, sttDoneAt }`. Never leaks Groq error details to the client.

**use-physical-extension.ts** — Trigger handler now short-circuits on `payload.desktopClaimed === true` (no `jarvis-wake-fire` dispatch). New `transcript` SSE listener dispatches `jarvis-voice-transcript` window event, identical in shape to the existing browser STT path output.

## The Voice-Source Claim Contract

```
Desktop heartbeat: POST /api/jarvis/voice/source/claim
  X-Trigger-Secret: <PHYSICAL_TRIGGER_SECRET>
  → 200 { ok: true, ttlMs: 30000 }
  → server sets lastClaimedAt = Date.now()

Within 30s of last heartbeat:
  GET /api/jarvis/physical/events → SSE trigger event carries { desktopClaimed: true }
  Browser handleTrigger: desktopClaimed === true → return (no browser mic)

After 30s without heartbeat:
  GET /api/jarvis/physical/events → SSE trigger event carries { desktopClaimed: false }
  Browser handleTrigger: fires jarvis-wake-fire (existing browser mic flow)
```

## The Transcript Dispatch Contract

```
Desktop (after VAD silence): POST /api/jarvis/voice/transcript
  X-Trigger-Secret: <PHYSICAL_TRIGGER_SECRET>
  body: raw WAV bytes
  x-jarvis-vad-end-at: <epoch ms> (optional)
  → 200 { transcript, sttDoneAt }
  → server emits physicalBus.emit("transcript", { transcript, sttDoneAt, vadEndAt?, at })

Browser (via existing SSE stream):
  EventSource → event: transcript → handleTranscript parses payload
  → window.dispatchEvent(new CustomEvent("jarvis-voice-transcript", { detail: {...} }))
  → JarvisConsole / GlobalJarvisHandler picks it up (existing path, unchanged)
```

## Deviations from Plan

None — plan executed exactly as written.

## Deferred Work

- Desktop heartbeat keep-alive timer (every ~10s during active turn) lives in Plan 14-03 (desktop side). The server TTL at 30s gives adequate margin for Plan 14-03's implementation.
- The `_resetVoiceSourceForTests()` helper is exported and underscore-prefixed per plan spec — test-only, not callable from production code by convention.

## Pre-existing TypeScript Errors (Out of Scope)

Two pre-existing errors found in `pnpm tsc --noEmit` (confirmed pre-existing via git stash check):
1. `.next/types/validator.ts(116)` — references `../../app/(app)/lifeos/page.js` which doesn't exist (build artifact)
2. `app/(app)/insights/page.tsx(68)` — prop type mismatch in InsightsTabs component

Neither is caused by Plan 14-02 changes. Both were present before this plan's first commit.

## Known Stubs

None — all code paths are wired. The `vadEndAt` field on `PhysicalTranscript` is optional by design (desktop may not always have VAD timing data available).

## Self-Check: PASSED
