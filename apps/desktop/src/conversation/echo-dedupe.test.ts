import { describe, expect, it } from "vitest";

import {
  createEchoDedupeState,
  decidePaintEcho,
  normalizeEcho,
  SAME_UTTERANCE_WINDOW_MS,
  type EchoInput,
} from "./echo-dedupe";

// Helper: run a sequence of echoes through one shared state and collect which
// ones painted. Mirrors how main.ts funnels both sources through the state.
function run(inputs: EchoInput[]): boolean[] {
  const state = createEchoDedupeState();
  return inputs.map((i) => decidePaintEcho(i, state));
}

describe("normalizeEcho", () => {
  it("trims, lowercases, and collapses whitespace", () => {
    expect(normalizeEcho("  What  TIME   is it? ")).toBe("what time is it?");
  });
});

describe("decidePaintEcho — exactly-once per utterance", () => {
  it("SSE transcript then POST fallback paints once (SSE first)", () => {
    const t = 1_000;
    const painted = run([
      { text: "what's the weather", sttDoneAt: 100, now: t },
      // POST fallback for the SAME utterance, no id, moments later.
      { text: "what's the weather", now: t + 300 },
    ]);
    expect(painted).toEqual([true, false]);
  });

  it("POST fallback then SSE transcript paints once (POST first)", () => {
    const t = 1_000;
    const painted = run([
      // id-less POST arrives first.
      { text: "open spotify", now: t },
      // SSE for the same utterance lands with its id.
      { text: "open spotify", sttDoneAt: 200, now: t + 300 },
    ]);
    expect(painted).toEqual([true, false]);
  });

  it("POST-only paints exactly once", () => {
    const painted = run([{ text: "read my messages", now: 5_000 }]);
    expect(painted).toEqual([true]);
  });

  it("SSE-only paints exactly once", () => {
    const painted = run([{ text: "lights off", sttDoneAt: 42, now: 5_000 }]);
    expect(painted).toEqual([true]);
  });

  it("suppresses an SSE reconnect replay of the same id, even past the window", () => {
    const t = 1_000;
    const painted = run([
      { text: "set a timer", sttDoneAt: 777, now: t },
      // Replay long after the window — identity still catches it.
      { text: "set a timer", sttDoneAt: 777, now: t + SAME_UTTERANCE_WINDOW_MS + 60_000 },
    ]);
    expect(painted).toEqual([true, false]);
  });
});

describe("decidePaintEcho — never drops a legitimately new utterance", () => {
  it("identical text in a different turn is NOT wrongly deduped (distinct ids, within window)", () => {
    const t = 1_000;
    // Two genuine "yes" confirmations moments apart, each with its own SSE id.
    const painted = run([
      { text: "yes", sttDoneAt: 1, now: t },
      { text: "yes", sttDoneAt: 2, now: t + 1_500 },
    ]);
    expect(painted).toEqual([true, true]);
  });

  it("repeated short command across a full SSE+POST turn pair paints once per turn", () => {
    const t = 1_000;
    const painted = run([
      // Turn 1: "stop" — SSE then POST.
      { text: "stop", sttDoneAt: 10, now: t },
      { text: "stop", now: t + 200 },
      // Turn 2: "stop" again, a moment later — SSE then POST.
      { text: "stop", sttDoneAt: 11, now: t + 1_800 },
      { text: "stop", now: t + 2_000 },
    ]);
    expect(painted).toEqual([true, false, true, false]);
  });

  it("id-less repeat OUTSIDE the window paints again", () => {
    const t = 1_000;
    const painted = run([
      { text: "again", now: t },
      { text: "again", now: t + SAME_UTTERANCE_WINDOW_MS + 1 },
    ]);
    expect(painted).toEqual([true, true]);
  });

  it("backfills identity from the SSE so a later repeat after a POST-first turn still paints", () => {
    const t = 1_000;
    const painted = run([
      // Turn 1: POST first (no id), then its SSE (id=1) — collapses to one paint,
      // and the SSE id backfills the painted ref.
      { text: "next", now: t },
      { text: "next", sttDoneAt: 1, now: t + 200 },
      // Turn 2: genuine repeat with a fresh id, still within the window of turn 1.
      { text: "next", sttDoneAt: 2, now: t + 1_500 },
    ]);
    expect(painted).toEqual([true, false, true]);
  });

  it("different utterances always paint", () => {
    const t = 1_000;
    const painted = run([
      { text: "what's the weather", sttDoneAt: 1, now: t },
      { text: "and tomorrow", sttDoneAt: 2, now: t + 500 },
    ]);
    expect(painted).toEqual([true, true]);
  });

  it("empty / whitespace-only text never paints", () => {
    const painted = run([
      { text: "", sttDoneAt: 1, now: 1_000 },
      { text: "   ", now: 1_100 },
    ]);
    expect(painted).toEqual([false, false]);
  });
});
