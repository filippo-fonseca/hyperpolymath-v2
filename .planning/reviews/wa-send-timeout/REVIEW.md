---
phase: bgsd/wa-send-timeout
reviewed: 2026-07-04
depth: standard
files_reviewed: 2
files_reviewed_list:
  - apps/desktop/src/actions/confirm-gate.ts
  - apps/web/lib/jarvis/executor.ts
findings:
  critical: 0
  warning: 0
  info: 2
  total: 2
status: clean
---

## Summary

Surgical ~60-line change reviewed against the five focus areas from the brief.
No BLOCKER or WARNING findings. The abort/timeout path is correctly implemented,
the success path is bit-identical to before (only `signal` added to fetch opts),
the invariant comments accurately reflect the code, and the executor.ts
sync-only invariant is honest.

### Focus-area verdicts

1. **Abort/timeout correctness** — Clean.
   - Timer at `confirm-gate.ts:141` is cleared in `finally` (`:177-179`), so
     success (`:161`), non-2xx (`:154`), and thrown-error branches all clear
     the timer. No leak.
   - Abort detection uses `ctrl.signal.aborted || err?.name === "AbortError"`
     (`:163`). The `signal.aborted` primary check is robust to the Tauri http
     plugin surfacing a non-standard error on abort — since we own the
     controller, `signal.aborted` is deterministically `true` when we entered
     the catch via our own timer.
   - **No double-counting**: an abort throws inside `await fetch`, so control
     never reaches the `!res.ok` branch. Timeout vs `http <n>` are mutually
     exclusive.

2. **Success-path invariance** — Clean.
   - Only diff on the fetch call is `signal: ctrl.signal` (`:147`). Method,
     headers, body are byte-identical. `lastSent` update (`:156`) and success
     log (`:158-160`) are unchanged. On 2xx, `finally` clears the timer before
     it can fire — no spurious abort of a completed request.

3. **Invariant comments accuracy** — Accurate.
   - `resolvePendingWithTranscript`: `clearPendingState()` runs BEFORE
     `void dispatchAndReport(action)`. Comment correctly names this as
     load-bearing. `clearPendingState` sets `pending = null`, clears the TTL
     timer, and calls `emitPendingChange(false)` if `hadPending`.
   - `executor.ts` INVARIANT jsdoc matches `sendMessage` — pure validation, no
     `await` on any I/O, only trims and narrows the discriminant. `run-turn.ts`
     caller does a plain awaited call on the synchronous body; no hidden hang
     path at the tool layer.

4. **Thread-safety / races on confirm-gate global state** — No new issues.
   - JS single-threaded; the module-scope mutables are only touched from event
     handlers on one loop.
   - Timer-vs-response race: if the 8s timer fires just as the response is
     being consumed, `ctrl.abort()` on an already-resolved fetch is a no-op;
     the subsequent `finally` clears an already-fired timer, also a no-op.

5. **executor.ts sync semantics** — Matches invariant.
   - `sendMessage` does zero network I/O and no `await`. The tool call always
     terminates.

## Info (Sev 3, FYI only — do not block)

### IN-01 — RESOLVED: Pre-confirm branch now mirrors the load-bearing-invariant comment

**File:** `apps/desktop/src/actions/confirm-gate.ts` (pre-confirm branch in
`holdSendMessage`).

The two-turn pre-confirm branch was doing the same fire-and-forget dispatch as
the resolve branch but without the invariant comment its twin had. A future
refactorer might have inferred the two paths were different and `await`-ed
this one. Mirror comment added in the same commit as the review. No open work.

### IN-02: Abort-detection error-shape assumption

**File:** `apps/desktop/src/actions/confirm-gate.ts:163`

`(err as { name?: string })?.name === "AbortError"` is a defensive OR against
`ctrl.signal.aborted`, which is sufficient on its own. Harmless; noting only
because the plan flagged uncertainty about the Tauri http plugin's error
shape. `signal.aborted` primary check keeps the branch robust regardless.
**Fix:** None. Leave as-is.

---

Verdict: **clean**. Two Sev-3 items are optional polish. IN-01 was applied in
this pass; IN-02 requires no action.
