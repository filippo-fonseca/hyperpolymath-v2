---
phase: 10-tts-route-boundary-latency-wins
plan: 02
subsystem: voice
tags: [tts, sentence-splitter, streaming, regex, pure-function, tdd, vitest]

# Dependency graph
requires:
  - phase: 09-latency-telemetry-baseline
    provides: tts_first_byte_at + audio_first_play_at stage capture (semantics now reinterpret to "first sentence" per D-06)
provides:
  - splitDeltas(prevBuffer, newDelta) → { sentences, remainder } pure function in apps/web/lib/voice/sentence-splitter.ts
  - SplitResult interface (sentences: string[]; remainder: string)
  - 14-test contract lock for the regex behaviour (per-terminator, mid-delta, continuation, butler-register, known-limitation Mr.)
affects: [10-04, JarvisConsole, GlobalJarvisHandler, TurnPlaybackController]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure function with caller-owned rolling buffer — no closures, no module-level state, no I/O"
    - "Literal regex /([.!?] |\\n\\n+)/g with matchAll for terminator-preserving sentence emission"
    - "Strict TDD: RED commit (failing test, module not found) → GREEN commit (implementation makes 14 pass)"

key-files:
  created:
    - apps/web/lib/voice/sentence-splitter.ts
    - apps/web/tests/sentence-splitter.test.ts
  modified: []

key-decisions:
  - "Pure function over closure-based mini-class: caller owns the rolling buffer (let buffer = ''; buffer = remainder) so the splitter has zero state and is trivially testable in isolation. Matches 10-CONTEXT.md 'Claude's Discretion' direction."
  - "Single regex /([.!?] |\\n\\n+)/g with String.prototype.matchAll over iterative indexOf — clearest emission of terminator-bearing sentences, lets TypeScript track match.index without a manual scan loop."
  - "Test 14 documents the Mr. abbreviation false-positive ('Mr. Stark is here. ' → ['Mr. ', 'Stark is here. ']) as accepted per <deferred> in 10-CONTEXT.md. Test asserts the actual behavior, not the desired-in-vacuum behavior, so the contract is honest."
  - "Empty-delta fast path returns { sentences: [], remainder: prevBuffer } so caller's `buffer = remainder` invariant always holds even on no-op ticks."
  - "Terminator is captured as part of the sentence (not stripped) so playback gets natural punctuation/space cadence; downstream TTS gets cleaner prosody."

patterns-established:
  - "Caller-owned-buffer pattern for streaming pure-function splitters: function returns (emitted[], remainder); caller assigns remainder back to buffer. Avoids reintroducing class/closure state purely for accumulation."
  - "Document-known-limitations-as-tests: tests assert what the splitter actually does on edge cases (Mr.) AND inline-comment why the cost is accepted. Future readers know the behavior is deliberate, not a bug."

requirements-completed: [LAT-02]

# Metrics
duration: 2min
completed: 2026-05-30
---

# Phase 10 Plan 02: Sentence-Boundary Splitter Summary

**Pure splitDeltas(prevBuffer, newDelta) → { sentences, remainder } function with 14-test contract: literal-regex terminator detection (`. `, `! `, `? `, `\n\n+`), no min-length gate, butler-register friendly, Mr. abbreviation false-positive documented and accepted.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-05-30T15:11:58Z
- **Completed:** 2026-05-30T15:13:54Z
- **Tasks:** 2 (TDD: RED + GREEN)
- **Files created:** 2

## Accomplishments

- `splitDeltas(prevBuffer: string, newDelta: string): SplitResult` exported from `apps/web/lib/voice/sentence-splitter.ts` — pure, no state, ready for 10-04 to consume from the JarvisConsole / GlobalJarvisHandler SSE text-delta loop.
- 14 vitest tests lock the contract: empty I/O, each terminator type (`. `, `! `, `? `, `\n\n`), no-terminator-all-to-remainder, trailing fragment retention, cross-delta continuation, multiple terminators in one delta, mixed terminators, double-newline mid-delta, butler-register single-token (`Yes. `), empty-delta-preserves-buffer, and the documented `Mr. Stark is here. ` false-positive.
- `pnpm vitest run tests/sentence-splitter.test.ts` exits 0 with 14 passed; `pnpm tsc --noEmit` exits 0.
- TDD discipline preserved: RED commit (`7a9f076`) lands before GREEN commit (`7e85fe9`); git log shows the two in order.

## Task Commits

1. **Task 1: Write failing tests for splitDeltas (RED)** — `7a9f076` (test)
2. **Task 2: Implement splitDeltas to pass all tests (GREEN)** — `7e85fe9` (feat)

## Files Created/Modified

- `apps/web/lib/voice/sentence-splitter.ts` — Pure `splitDeltas` + `SplitResult` export with usage JSDoc and D-02 rationale inline. Single regex `/([.!?] |\n\n+)/g` driven by `matchAll`; one local `let lastEnd = 0` is the only mutable state and it lives inside the function body.
- `apps/web/tests/sentence-splitter.test.ts` — 14 vitest behaviors under one `describe("splitDeltas (LAT-02 sentence boundary)")` block. Mirrors `jarvis-input-payload.test.ts` style (top-level imports, `expect.toEqual` over loose matchers).

## Final Contract (Locked for 10-04)

```typescript
export interface SplitResult {
  sentences: string[];   // each retains terminator: ". ", "! ", "? ", or "\n\n"
  remainder: string;     // unfinished tail; caller carries forward
}

export function splitDeltas(
  prevBuffer: string,
  newDelta: string,
): SplitResult;
```

**Caller pattern documented in JSDoc:**

```typescript
let buffer = "";
// per delta:
const { sentences, remainder } = splitDeltas(buffer, delta);
buffer = remainder;
for (const s of sentences) playSentence(s, seq++);
// on stream close:
if (buffer.trim()) playSentence(buffer, seq++);  // final flush
```

10-04 imports this verbatim — no need to re-derive the regex or the buffer invariant.

## Decisions Made

- **Pure function over class** — caller-owned rolling buffer means no closures, no `useRef`, no `useReducer`, no module-level state. Trivially mockable and testable in isolation.
- **Single regex + `matchAll`** — clearest path to emit terminator-bearing sentences; TypeScript tracks `match.index` cleanly.
- **Terminator stays attached to the sentence** — downstream TTS prosody benefits from natural punctuation/space cadence; stripping would force the consumer to re-add it.
- **Empty-delta fast path returns `{ sentences: [], remainder: prevBuffer }`** — keeps the `buffer = remainder` caller invariant simple across no-op ticks.
- **Test 14 documents the Mr. false-positive** — the test asserts `splitDeltas("", "Mr. Stark is here. ")` → `{ sentences: ["Mr. ", "Stark is here. "], remainder: "" }`. JARVIS butler register never produces these, so the cost is theoretical and explicitly accepted per `<deferred>` in 10-CONTEXT.md. Inline KNOWN-LIMITATION comment explains the deferral.

## Deviations from Plan

None — plan executed exactly as written. RED → GREEN sequence followed; both commits made with the exact message format the plan specified; all 14 acceptance criteria for both tasks met on first attempt.

## Issues Encountered

None.

## Known Limitation

**Mr./Dr./Inc. abbreviation false-positive (accepted).** The literal `. ` boundary splits `"Mr. Stark is here. "` into `["Mr. ", "Stark is here. "]` rather than treating `"Mr."` as part of the preceding clause. JARVIS register is butler-clipped (`"Filed."`, `"Noted, sir."`, `"Two items in."`) and does not produce these constructions, so the cost is theoretical. Documented in:

- `lib/voice/sentence-splitter.ts` header JSDoc (rationale)
- `tests/sentence-splitter.test.ts` test 14 (KNOWN-LIMITATION inline comment + assertion of actual behavior)

Revisit if future quote-back / read-aloud features need abbreviation-aware splitting — would require either a hand-rolled abbreviation list or the `sbd` library, both deferred per 10-CONTEXT.md `<deferred>`.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **For Plan 10-04 (TurnPlaybackController + JarvisConsole / GlobalJarvisHandler wiring):** Import `splitDeltas` from `@/lib/voice/sentence-splitter` and follow the JSDoc caller pattern. The regex is locked; do not re-derive. The Mr. false-positive is accepted; no defensive handling needed at the call site.
- **For Plan 10-03 (parallel — audio-queue PCM + TTS proxy):** Disjoint surface; no coupling.
- **For Phase Success Criterion #2 ("audio of sentence 1 starts playing while the model is still streaming sentence 2"):** Unblocked at the pure-function level. Integration lands in 10-04.
- **For Phase Success Criterion #5 ("no regression in JARVIS routing quality"):** Preserved trivially — this plan touches zero routing code.

## Self-Check

```
FOUND: apps/web/lib/voice/sentence-splitter.ts
FOUND: apps/web/tests/sentence-splitter.test.ts
FOUND commit: 7a9f076 (test RED)
FOUND commit: 7e85fe9 (feat GREEN)
14 tests pass; tsc --noEmit exits 0
```

## Self-Check: PASSED

---
*Phase: 10-tts-route-boundary-latency-wins*
*Completed: 2026-05-30*
