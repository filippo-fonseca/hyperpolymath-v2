/**
 * ack-phrases — spoken tool-latency acknowledgements.
 *
 * Contract: always a non-empty, speech-ready line ending in a period; tool-aware
 * for known tools + prefix families (find_*); varied across rotations so
 * consecutive tool turns never repeat the same canned ack.
 */

import { describe, it, expect } from "vitest";
import { ackPhraseForTool } from "@/lib/jarvis/ack-phrases";

describe("ackPhraseForTool", () => {
  it("returns a non-empty, sentence-terminated line for any tool", () => {
    for (const name of ["get_news", "get_weather", "read_gmail", "web_search", "unknown_tool", ""]) {
      const line = ackPhraseForTool(name, 0);
      expect(line.length).toBeGreaterThan(0);
      expect(line.endsWith(".")).toBe(true);
    }
  });

  it("is tool-aware for known tools", () => {
    expect(ackPhraseForTool("get_news", 0).toLowerCase()).toContain("news");
    expect(ackPhraseForTool("get_weather", 0).toLowerCase()).toMatch(/weather|forecast|skies/);
    expect(ackPhraseForTool("read_gmail", 0).toLowerCase()).toMatch(/inbox|email|mail/);
  });

  it("matches find_* as a prefix family", () => {
    const a = ackPhraseForTool("find_tasks", 0);
    const b = ackPhraseForTool("find_captures", 0);
    const c = ackPhraseForTool("find_events", 0);
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(a.endsWith(".")).toBe(true);
  });

  it("varies across consecutive rotations (no immediate repeat)", () => {
    const first = ackPhraseForTool("get_news", 0);
    const second = ackPhraseForTool("get_news", 1);
    expect(first).not.toBe(second);
  });

  it("wraps rotation modulo the pool and tolerates negatives", () => {
    const zero = ackPhraseForTool("get_news", 0);
    // The get_news pool has 3 entries; rotation 3 wraps back to index 0.
    expect(ackPhraseForTool("get_news", 3)).toBe(zero);
    // Negative rotations still resolve to a valid, terminated line.
    expect(ackPhraseForTool("get_news", -1).endsWith(".")).toBe(true);
  });

  it("falls back to a generic line for unknown tools", () => {
    const line = ackPhraseForTool("totally_made_up_tool", 0);
    expect(line.toLowerCase()).toContain("sir");
  });
});
