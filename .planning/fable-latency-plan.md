# Fable plan — JARVIS latency inconsistency + iMessage double-send

Investigation only; no code changed. Branch `next`, 2026-07-05.

---

## Issue 1 — Inconsistent latency

### What the cache numbers actually say (this reframes the issue)

The prompt cache has **three tiers**:

1. **1h tier** — tools breakpoint + system breakpoint on the project-list block
   (`packages/jarvis-core/src/prompt-builder.ts:139-143`). This is the **15,711-token**
   stable prefix.
2. **5m tier** — the snapshot block breakpoint added in
   `apps/web/lib/jarvis/run-turn.ts:405-410`. Because caching is prefix-based, this 5m
   segment spans **facts block + snapshot** (everything between the 1h breakpoint and the
   snapshot breakpoint). That segment is the **~2,089 tokens**.
3. Uncached tail — temporal block + session-entities scratchpad (`run-turn.ts:500-508`).

So the logs decode as:

- Warmup `read 15711 / create 0`: the warmup **works** for the 1h tier — it reproduces the
  15,711 prefix byte-identically (same `buildSystemPrompt` args, same
  `buildToolDefinitions({voiceActive:false})`, same beta header via the shared
  `getAnthropicClient`). No prefix mismatch exists at this tier.
- "Cold" turn `read 15711 / create 2089`: the turn **read the whole 1h prefix** and only
  created the volatile 5m segment (facts + snapshot). The warmup cannot durably pre-create
  this segment: `extractAndPersistFacts` (`run-turn.ts:910`) mutates `jarvis_facts` after
  nearly every turn, and any CRUD bumps `stateVersion` → snapshot changes. That is also why
  `create 2089` recurs on scattered mid-session turns (fact/snapshot mutation or >5m gap),
  not just turn 1.
- **Key deduction: creating 2,089 tokens costs ~1-2s of prefill, not 45s. The cache is NOT
  the cause of the 45s turns.** The `create=2089` on slow turns is a coincident marker
  (both correlate with "first turn after something changed"), not the mechanism.

### Root cause A — transcript echo is bound to the POST, and the POST is turn-bound

The desktop paints the user's echo when `POST /api/jarvis/voice/transcript` resolves. Even
though the agent turn was moved into `after()` (`transcript/route.ts:246`), the evidence
(45s POST log lines AND slow echo on the same turns) shows the response is not reliably
flushed before the `after()` work completes in `next dev` — `after()` defers *scheduling*
but the dev server does not detach the response/connection from the request's pending work.
(The 637ms POSTs are consistent with probe requests, which return at
`transcript/route.ts:106-108` before any turn, and/or the occasions dev did flush early —
either way the POST cannot be trusted as the echo signal.)

Independently, everything **before** `after()` is a serial chain that also gates the echo:
Groq STT (`route.ts:90`), `getEnabledRoutines` (`:147`), `buildRecentHistory` (`:202`),
`getUserKeyOrNull` (`:231`) — each a network/DB round-trip.

### Root cause B — response-latency non-determinism

Since the 1h prefix is read even on slow turns, the fast/slow variance in a warm session
comes from stalls *outside* the cache:

1. **Turn start is coupled to response-flush semantics** (`after()` in dev, per above): when
   the flush is delayed, `runJarvisTurnStream` — and therefore the first SSE chunk and TTS —
   starts late. This is the same mechanism as root cause A and explains why slow response
   and slow echo co-occur on the same turns.
2. **Pre-turn serial round-trips** (STT + 3-4 DB queries): a Groq STT stall or a dropped
   pooled Postgres connection (postgres.js `connect_timeout` defaults to 30s) produces
   exactly the observed signature — an occasional ~30-45s turn at a random point in a warm
   session, with echo and response both late (both are downstream of this chain).
3. The 5m-tier recreate (2,089 tokens) adds only ~1-2s; not the story.

What is NOT confirmed from evidence alone: whether a given slow turn was (1) or (2). The fix
below removes (1) structurally and adds three cheap timing logs to pin (2) in one session.

### Fix plan (minimal)

1. **Paint the echo from SSE, not the POST.**
   - Server already emits it: `emitPhysicalTranscript` at `transcript/route.ts:184` →
     event name `"transcript"` (`apps/web/lib/voice/physical-extension/bus.ts:109-111`).
   - Desktop: add a `source.addEventListener("transcript", …)` in
     `apps/desktop/src/physical-extender/sse-client.ts` (next to the existing listeners at
     :213-247) and route it to the same echo-paint path currently driven by the POST
     resolution. Keep the POST-driven paint as a fallback only if the SSE event hasn't
     already painted that transcript (dedupe by `sttDoneAt` or transcript text).
   - Result: echo appears ~STT-time (~1s) on every turn, regardless of `after()` behavior.

2. **Decouple turn start from response flush.** In `transcript/route.ts:246-332`, replace
   `after(() => { void runJarvisTurnStream({...}) })` with:
   ```ts
   const turnPromise = runJarvisTurnStream({...});   // start NOW
   after(() => turnPromise);                          // only keeps the serverless fn alive
   return Response.json({ transcript, turnId }, ...);
   ```
   The turn communicates over SSE + DB only, so starting it before the return is safe; the
   `after(promise)` retains the Vercel keep-alive property. This makes first-SSE-chunk time
   independent of whether dev flushes the response early.

3. **Instrument the pre-turn chain** (one-line logs in `transcript/route.ts`): STT ms
   (around :90), setup ms (STT-done → `after` registration), and turn-start delta (already
   derivable from `stages.promptBuiltAt` in `logJarvisEvent`, `run-turn.ts:919-940`). One
   test session then pins any residual slow turn on Groq vs DB pool vs Anthropic TTFT.

4. **Warmup: document, don't chase.** The warmup correctly warms the 1h tier (proven by
   `read 15711`). Do not try to pre-create the 5m facts+snapshot tier — it is volatile by
   design (invalidated by `extractAndPersistFacts` and `stateVersion` bumps) and costs only
   ~2K tokens of prefill. Optional cheap win, separate from this fix: move the facts block
   AFTER the snapshot breakpoint (swap order in `run-turn.ts:405-410` vs
   `prompt-builder.ts:151-156`) so fact mutation stops invalidating the snapshot's 5m
   segment; low priority since the segment is small.

---

## Issue 2 — iMessage double-send

### Root cause

The two sends are two separate model emissions, and **both** slipped through the gate:

**Send #1 (at readback).** Per the SEND_MESSAGE guardrail
(`packages/jarvis-core/src/personality.ts:209`), the model emits the `send_message` tool
call *together with* the readback — by design; the desktop gate is supposed to hold it. But
`holdSendMessage`'s pre-confirm branch (`apps/desktop/src/actions/confirm-gate.ts:346-368`)
tests `lastTranscript` — which at that moment is the user's ORIGINAL REQUEST, "Send a
message to Rohan… we're at the library" — against `AFFIRM_RE` (`confirm-gate.ts:53-54`).
`AFFIRM_RE` contains the alternation `send(?: it| that| the message)?` — the **optional
group makes a bare leading "send" an affirmative**, so any utterance that *starts with*
"Send …" pre-confirms its own send. Commit 9fda68e fixed `hasUnnegatedSendVerb` but left
this bare-`send` branch in `AFFIRM_RE`. The request transcript is well inside the 20s
`PRECONFIRM_WINDOW_MS`, so the action dispatches immediately at readback.

**Send #2 (after "Yes").** Because send #1 was pre-confirmed (never held), `pending` is
null, so the user's "Yes" is not consumed by `resolvePendingWithTranscript` and is recorded
as `lastTranscript` (`confirm-gate.ts:439-447`). The "Yes" also reaches the server as a new
turn; the model re-emits `send_message` (documented flow-1 hazard, header comment
`confirm-gate.ts:18-22`) — but with *different text*: the first emission carried a
"(Sent via Jarvis)" suffix, the second didn't. That suffix appears **nowhere in the
codebase** (grep of desktop + jarvis-core): it is model improvisation (possibly steered by a
stored jarvis_fact), i.e. text variance between emissions is expected. The exact-match
dedupe (`confirm-gate.ts:333-344`, `lastSent.text === action.text`) therefore misses, the
"Yes" `lastTranscript` matches `AFFIRM_RE`, and the second send pre-confirms too.

### Fix plan (minimal, keeps all confirm-gate invariants)

All in `apps/desktop/src/actions/confirm-gate.ts`:

1. **Kill the bare-`send` affirmative** (`:53-54`): change
   `send(?: it| that| the message)?` → `send (?:it|that|the message)` (object required).
   A lone "send" as a complete confirm utterance is still caught by
   `hasUnnegatedSendVerb`'s `\bsend\b\s*$` (`:72`). This alone stops a "send a message to X…"
   request from pre-confirming the send it triggers.
2. **Belt-and-braces on the pre-confirm branch** (`:346-349`): refuse pre-confirmation when
   the candidate transcript looks like a message-composition REQUEST rather than a
   confirmation — e.g. `if (/\bsend (?:a|an|another) (?:message|text)\b|\b(?:text|message)\s+\w+\s+(?:that|saying|:)/i.test(lastTranscript.text)) skip`.
   A request phrase must never count as its own confirmation.
3. **Normalized dedupe** (`:333-344` and the two `lastSent = …` writes at `:183` and
   `:270`): dedupe on `(app, recipient.toLowerCase(), normalize(text))` where
   `normalize` lowercases, collapses whitespace, and strips a trailing parenthetical
   signature: `.replace(/\s*\((?:sent )?via jarvis\.?\)\s*$/i, "")`. Also treat as duplicate
   when one normalized text is a prefix of the other (suffix-only variants). Keep the 30s
   window.
4. **Dispatch latch** (robust backstop, independent of text): when `dispatchAndReport` is
   invoked (both call sites, `:366` and `:413`), record
   `lastDispatch = { app, recipient: lc, at }`; in `holdSendMessage`, a new action for the
   same `(app, recipient)` arriving within ~15s of a dispatch is HELD (normal pending flow),
   never pre-confirmed — a re-emitted tool call for the same logical send then requires a
   fresh explicit "yes" instead of riding the stale one. This preserves the legitimate
   "send Rohan a second, different message" flow (the user just confirms again).

Ordering: (1) and (3) are the core fix; (2) and (4) are cheap hardening. None of them add a
new auto-send path — every change only narrows when a send may fire without a held confirm.
