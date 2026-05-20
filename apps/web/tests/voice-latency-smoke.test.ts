/**
 * Phase 7 Plan 07-04 — VOICE-13 latency budget smoke test.
 *
 * This is NOT a real-network integration test (those run manually via
 * jarvis_events telemetry per CONTEXT.md). This is a budget-math
 * verification: given stage timings drawn from RESEARCH.md's p50/p95
 * table, the total end-to-end stays under VOICE-13 thresholds.
 *
 * VOICE-13 targets:
 *   - p50 end-to-end latency < 3000ms
 *   - p95 end-to-end latency < 6000ms
 *
 * Stage breakdown (from RESEARCH.md latency budget table):
 *   VAD silence detection: p50 ~100ms
 *   Groq Whisper STT:      p50 ~80ms
 *   Claude Sonnet:         p50 ~800ms
 *   ElevenLabs Flash TTS:  p50 ~75ms
 *   Browser decode:        p50 ~20ms
 *   Total p50:             ~1075ms (well under 3000ms)
 *
 * If a real network test is ever wanted, set ANTHROPIC_LIVE=true and
 * extend this file with an opt-in describe.skipIf branch.
 */

import { describe, it, expect } from "vitest";

interface Turn {
  vadMs: number;
  sttMs: number;
  claudeMs: number;
  elevenLabsMs: number;
  decodeMs: number;
}

/** Sum all stage latencies for one voice turn. */
function totalLatency(turn: Turn): number {
  return turn.vadMs + turn.sttMs + turn.claudeMs + turn.elevenLabsMs + turn.decodeMs;
}

/**
 * Calculate the p-th percentile of a numeric array.
 * Uses nearest-rank (floor) method for simplicity and determinism.
 */
function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.floor((p / 100) * (sorted.length - 1));
  return sorted[idx]!;
}

// ─── Deterministic 10-turn workloads ─────────────────────────────────────

/** P50 workload: stage timings sampled around RESEARCH p50 values with mild variance. */
const P50_WORKLOAD: Turn[] = [
  { vadMs: 100, sttMs: 80, claudeMs: 800, elevenLabsMs: 75, decodeMs: 20 },
  { vadMs: 90,  sttMs: 75, claudeMs: 850, elevenLabsMs: 80, decodeMs: 25 },
  { vadMs: 110, sttMs: 85, claudeMs: 780, elevenLabsMs: 70, decodeMs: 20 },
  { vadMs: 100, sttMs: 80, claudeMs: 900, elevenLabsMs: 75, decodeMs: 20 },
  { vadMs: 95,  sttMs: 78, claudeMs: 820, elevenLabsMs: 72, decodeMs: 22 },
  { vadMs: 105, sttMs: 82, claudeMs: 780, elevenLabsMs: 78, decodeMs: 18 },
  { vadMs: 100, sttMs: 80, claudeMs: 800, elevenLabsMs: 75, decodeMs: 20 },
  { vadMs: 100, sttMs: 80, claudeMs: 1100, elevenLabsMs: 75, decodeMs: 20 }, // mild spike
  { vadMs: 90,  sttMs: 70, claudeMs: 750, elevenLabsMs: 70, decodeMs: 18 },
  { vadMs: 100, sttMs: 80, claudeMs: 800, elevenLabsMs: 75, decodeMs: 20 },
];

/** P95 workload: pinned to RESEARCH's p95 values. All turns at p95 stage times. */
const P95_WORKLOAD: Turn[] = Array.from({ length: 10 }, () => ({
  vadMs: 200,
  sttMs: 200,
  claudeMs: 4000,
  elevenLabsMs: 200,
  decodeMs: 50,
}));

// ─── Tests ───────────────────────────────────────────────────────────────

describe("VOICE-13 latency budget", () => {
  it("p50 workload: measured p50 < 3000ms", () => {
    const totals = P50_WORKLOAD.map(totalLatency);
    const p50 = percentile(totals, 50);

    // All p50 turns are comfortably under 3000ms.
    // The workload's median is ~1075ms — the budget allows ~2.8× headroom.
    expect(p50).toBeLessThan(3000);
  });

  it("p95 workload: all turns < 6000ms (matches VOICE-13 p95)", () => {
    const totals = P95_WORKLOAD.map(totalLatency);
    const p95 = percentile(totals, 95);

    // p95 workload (4000ms Claude + 200ms others) = 4650ms, well under 6000ms.
    expect(p95).toBeLessThan(6000);
  });

  it("budget math is deterministic", () => {
    const t: Turn = {
      vadMs: 100,
      sttMs: 80,
      claudeMs: 800,
      elevenLabsMs: 75,
      decodeMs: 20,
    };
    // 100 + 80 + 800 + 75 + 20 = 1075
    expect(totalLatency(t)).toBe(1075);
  });
});
