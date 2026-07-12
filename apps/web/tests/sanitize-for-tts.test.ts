import { describe, expect, it } from "vitest";

import { sanitizeForTts } from "@/lib/voice/sanitize-for-tts";

describe("sanitizeForTts", () => {
  it("turns an em dash into a comma + space (short pause, not dead air)", () => {
    expect(sanitizeForTts("I'm at the airport. — Jarvis")).toBe(
      "I'm at the airport. Jarvis",
    );
  });

  it("handles a mid-sentence em dash as a comma pause", () => {
    expect(sanitizeForTts("The plan — such as it is — holds.")).toBe(
      "The plan, such as it is, holds.",
    );
  });

  it("converts en dashes and ASCII -- the same way", () => {
    expect(sanitizeForTts("Nine – ten")).toBe("Nine, ten");
    expect(sanitizeForTts("wait -- what")).toBe("wait, what");
  });

  it("strips markdown emphasis, code, and headings", () => {
    expect(sanitizeForTts("**Bold** and `code` here")).toBe("Bold and code here");
    expect(sanitizeForTts("# Heading\nBody")).toBe("Heading\nBody");
  });

  it("speaks only the label of a markdown link and drops bare URLs", () => {
    expect(sanitizeForTts("See [the docs](https://x.com/y).")).toBe(
      "See the docs.",
    );
    expect(sanitizeForTts("Visit https://example.com now")).toBe("Visit now");
  });

  it("collapses a comma abutting a sentence-ender", () => {
    // em dash before a period would otherwise leave ", ."
    expect(sanitizeForTts("Done —.")).toBe("Done.");
  });

  it("collapses doubled commas and repeated ! / ?", () => {
    expect(sanitizeForTts("yes,, no")).toBe("yes, no");
    expect(sanitizeForTts("Really?? Wow!!")).toBe("Really? Wow!");
  });

  it("preserves ellipsis", () => {
    expect(sanitizeForTts("Well... maybe.")).toBe("Well... maybe.");
  });

  it("leaves quotes untouched", () => {
    expect(sanitizeForTts('She said "hello".')).toBe('She said "hello".');
  });

  it("does not mangle content words, decimals, or abbreviations", () => {
    expect(sanitizeForTts("It took 1.5 hours, e.g. C. elegans.")).toBe(
      "It took 1.5 hours, e.g. C. elegans.",
    );
    expect(sanitizeForTts("real-world costs")).toBe("real-world costs");
  });

  it("is idempotent", () => {
    const once = sanitizeForTts("A — B **bold** [x](http://z).");
    expect(sanitizeForTts(once)).toBe(once);
  });

  it("returns empty string for empty input", () => {
    expect(sanitizeForTts("")).toBe("");
  });
});
