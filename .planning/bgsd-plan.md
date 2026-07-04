# PLAN — unit `wa-send-timeout`

Fail-fast timeout + clean failure UX on WhatsApp send so a dead bridge never
wedges the desktop confirm-gate + conversation.

## Root cause (verified in current worktree)

`apps/desktop/src/actions/confirm-gate.ts:117-154` — `executeWhatsappSend`
POSTs to the local bridge with `@tauri-apps/plugin-http`'s `fetch`, no
`AbortSignal`, no timeout. If the bridge process is dead / hung / mid-QR-pair,
the fetch hangs indefinitely. The user cannot see anything happening; the
turn's TTS never fires; and although the confirm gate is architecturally
non-blocking (`resolvePendingWithTranscript` calls `void dispatchAndReport(...)`
at :269 and `clearPendingState()` at :266 fires BEFORE dispatch), the app
subjectively feels wedged because the failure line is never spoken and the
conversation FSM never gets an outcome signal.

## Server-side audit — `apps/web/lib/jarvis/executor.ts:921-943`

`sendMessage` is a pure synchronous validator: trims recipient + text, narrows
`app`, returns `{ ok, id, receipt, action }`. NO network call, NO await, cannot
hang. The tool call always terminates. Route through `run-turn.ts:680-684` is
a plain awaited call to the same sync function. **No changes needed here.**
Documented in the code comment so a future reader doesn't re-audit.

## Changes

### T1 — `executeWhatsappSend`: add 8s AbortController timeout

File: `apps/desktop/src/actions/confirm-gate.ts`

- Introduce `WHATSAPP_SEND_TIMEOUT_MS = 8_000` next to the other window-ms
  constants (mirrors the `PENDING_TTL_MS` / `DEDUPE_WINDOW_MS` style).
- Inside `executeWhatsappSend`, build an `AbortController`, arm
  `setTimeout(() => ctrl.abort(), WHATSAPP_SEND_TIMEOUT_MS)`, pass
  `signal: ctrl.signal` to `fetch`. Clear the timer in a `finally`.
- Distinguish the three failure modes for the log line:
  - Abort → `reason: "timeout"` (from `err?.name === "AbortError"` or the
    Tauri http plugin's `NetworkError` w/ abort signal).
  - Any other thrown error → `reason: "unreachable"` (current behavior).
  - Non-2xx response → `reason: "http <n>"` (current behavior).
- Success path unchanged.

Commit: `fix(desktop): 8s abort timeout on WhatsApp bridge send so a dead bridge fails fast`

### T2 — Speak a distinct line on timeout (versus reachability failure)

File: `apps/desktop/src/actions/confirm-gate.ts`

- `dispatchAndReport` currently speaks one canned line: "I couldn't reach
  WhatsApp, sir." That is honest for both `unreachable` and `http 502`, but a
  hang-until-timeout is a slightly different signal ("bridge is up but not
  answering" — often means unpaired or wedged). Speak a more specific line
  when `result.reason === "timeout"`, matching the brief's example ("I could
  not reach WhatsApp, sir — the bridge may be disconnected."), while keeping
  the plain "couldn't reach" line for the other WA-fail cases.
- Same on iMessage failure (unchanged copy).

Commit: (rolled into T1 — same file, same functional change scope)

### T3 — Prove pending-UI clearing on failure

File: `apps/desktop/src/actions/confirm-gate.ts`

Read-through only. `resolvePendingWithTranscript` at :258-273 calls
`clearPendingState()` BEFORE `void dispatchAndReport(action)` — so
`emitPendingChange(false)` has already fired, the amber HUD ring is off, and
`pendingListeners` are informed the confirm is no longer pending, before the
network call even starts. Dispatch is fire-and-forget, so a subsequent
transcript is processed immediately by the transcript listener. **No code
change needed; comment on this invariant so a future refactor doesn't
accidentally block the transcript queue on the send.**

Add a one-line invariant comment near `void dispatchAndReport(action)`
naming that the fire-and-forget is load-bearing for input-unblocking.

Commit: (rolled into T1 — comment-only, single file)

### T4 — Server-side audit note

File: `apps/web/lib/jarvis/executor.ts`

Add a short comment above `sendMessage` (currently line 921) recording that
this executor is intentionally synchronous — the safety-critical send happens
on the desktop confirm-gate. This is documentation of an invariant that
future editors need to keep true (or the "can't hang the agent turn"
guarantee breaks silently). No code change.

Commit: `docs(web): note that jarvis executor.sendMessage is sync-only — real send is desktop-side`

## Verification against acceptance criteria

| Criterion | How this plan satisfies it |
|---|---|
| Bridge down → cleanly fails within ~8s | T1 AbortController + 8s timeout on the `fetch`. |
| After failure, confirm-gate + conversation unblocked, no restart | Already true structurally (`clearPendingState` fires before `void dispatchAndReport`; dispatch is fire-and-forget); T3 pins the invariant with a comment. |
| Clear spoken failure line + pending "awaiting confirmation" cleared | T2 speaks the specific line on timeout; the amber pending ring already goes down via `emitPendingChange(false)` in `clearPendingState()` before dispatch. |
| Successful send unchanged | T1 only adds a signal + timer to the exact same request; on 2xx the finally clears the timer, the success log + `lastSent` update fire as today. |
| `send_message` tool always terminates | T4's audit — synchronous validator, no I/O, no await ⇒ trivially terminates. |

## Out of scope

- Making the bridge itself more responsive / adding a healthcheck ping.
- Retries. If the bridge is down, retry-in-place would just extend the hang;
  the correct UX is to fail fast and tell the user.
- Changing the confirm-gate architecture. The current fire-and-forget-dispatch
  design already prevents the transcript pipeline from being blocked; that's
  the reason input-unblocking is essentially free once the fetch itself
  bounds.
