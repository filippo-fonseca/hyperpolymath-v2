import { describe, expect, it } from "vitest";

import { splitSmsSegments, SMS_SEGMENT_LIMIT } from "../split-message";

describe("splitSmsSegments", () => {
  it("keeps a short reply as a single message", () => {
    expect(splitSmsSegments("Done, sir.")).toEqual(["Done, sir."]);
  });

  it("returns nothing for an empty or blank reply", () => {
    expect(splitSmsSegments("")).toEqual([]);
    expect(splitSmsSegments("   \n  ")).toEqual([]);
  });

  it("never exceeds the limit", () => {
    const text = "Sentence number one. ".repeat(400);
    for (const segment of splitSmsSegments(text)) {
      expect(segment.length).toBeLessThanOrEqual(SMS_SEGMENT_LIMIT);
    }
  });

  it("packs greedily, so it uses as few messages as possible", () => {
    // 40 sentences of 30 characters ≈ 1200 characters, comfortably one message.
    const text = Array.from({ length: 40 }, (_, i) => `This is sentence ${i} of many.`).join(" ");
    expect(text.length).toBeLessThan(SMS_SEGMENT_LIMIT);
    expect(splitSmsSegments(text)).toHaveLength(1);
  });

  it("breaks on a sentence boundary rather than mid-word", () => {
    const first = `${"a".repeat(40)}. `;
    const text = first.repeat(3);
    const segments = splitSmsSegments(text, 90);
    expect(segments.length).toBeGreaterThan(1);
    for (const segment of segments) {
      expect(segment.endsWith(".")).toBe(true);
    }
  });

  it("falls back to a whitespace break when there is no sentence end", () => {
    const text = "alpha bravo charlie delta echo foxtrot golf hotel";
    const segments = splitSmsSegments(text, 20);
    expect(segments.join(" ")).toBe(text);
    for (const segment of segments) {
      expect(segment).not.toMatch(/^\s|\s$/);
      expect(segment.length).toBeLessThanOrEqual(20);
    }
  });

  it("hard-cuts an unbroken run, such as a very long URL", () => {
    const url = `https://example.com/${"x".repeat(120)}`;
    const segments = splitSmsSegments(url, 50);
    expect(segments.join("")).toBe(url);
    expect(segments.every((s) => s.length <= 50)).toBe(true);
  });

  it("loses no content when splitting", () => {
    const text = Array.from({ length: 120 }, (_, i) => `Item ${i} is here.`).join(" ");
    const rejoined = splitSmsSegments(text, 200).join(" ");
    expect(rejoined.replace(/\s+/g, " ")).toBe(text.replace(/\s+/g, " "));
  });
});
