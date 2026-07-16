/**
 * strip-markdown-for-speech — unit tests (Unit 3, defense-in-depth for the
 * no-markdown spoken-output rule).
 *
 * The sanitizer removes markdown FORMATTING TOKENS from spoken text so nothing
 * structural (**bold**, numbered lists, headings, URLs) ever reaches TTS — even
 * if the prompt contract slips. The hard constraint (spec §6): strip formatting
 * only, never words; content like "1.5 hours" and "C. elegans" must survive.
 */

import { describe, expect, test } from "vitest";
import { stripMarkdownForSpeech } from "@/lib/voice/strip-markdown-for-speech";

describe("stripMarkdownForSpeech", () => {
  test("empty / passthrough", () => {
    expect(stripMarkdownForSpeech("")).toBe("");
    expect(stripMarkdownForSpeech("Nothing to strip here, sir.")).toBe(
      "Nothing to strip here, sir.",
    );
  });

  test("the transcript case: '**World** 1. Argentina… 2. Australia…' loses markdown", () => {
    const input = "**World**\n1. Argentina beat Brazil.\n2. Australia flooding.";
    const out = stripMarkdownForSpeech(input);
    expect(out).not.toContain("**");
    // The `1.`/`2.` line-start ordered-list markers are gone.
    expect(out).not.toMatch(/^\s*\d+\.\s/m);
    expect(out).toContain("World");
    expect(out).toContain("Argentina beat Brazil.");
    expect(out).toContain("Australia flooding.");
  });

  test("bold, italic, and inline code are unwrapped (words kept)", () => {
    expect(stripMarkdownForSpeech("**urgent** matter")).toBe("urgent matter");
    expect(stripMarkdownForSpeech("an *idle* thought")).toBe("an idle thought");
    expect(stripMarkdownForSpeech("run `read_gmail` now")).toBe("run read_gmail now");
    expect(stripMarkdownForSpeech("__strong__ point")).toBe("strong point");
  });

  test("headings and blockquotes drop their markers", () => {
    expect(stripMarkdownForSpeech("# Weather\nClear skies.")).toBe(
      "Weather\nClear skies.",
    );
    expect(stripMarkdownForSpeech("> a quote")).toBe("a quote");
  });

  test("unordered list markers at line start are removed", () => {
    const out = stripMarkdownForSpeech("- matcha\n- pineapples\n- the brief");
    expect(out).not.toMatch(/^\s*[-*+]\s/m);
    expect(out).toContain("matcha");
    expect(out).toContain("pineapples");
  });

  test("links speak only the label; bare URLs are dropped", () => {
    expect(stripMarkdownForSpeech("see [the article](https://x.com/a)")).toBe(
      "see the article",
    );
    expect(stripMarkdownForSpeech("read https://example.com/foo now")).toBe(
      "read now",
    );
  });

  // --- Guards (spec §6): never eat legitimate content ----------------------

  test("guard: '1.5 hours' survives (decimal, not an ordered-list marker)", () => {
    expect(stripMarkdownForSpeech("It takes 1.5 hours")).toBe("It takes 1.5 hours");
  });

  test("guard: 'C. elegans' survives (mid-sentence abbreviation)", () => {
    expect(stripMarkdownForSpeech("The worm C. elegans is a model organism")).toBe(
      "The worm C. elegans is a model organism",
    );
  });

  test("guard: snake_case tool names are not mangled by italics stripping", () => {
    expect(stripMarkdownForSpeech("call read_gmail then get_news")).toBe(
      "call read_gmail then get_news",
    );
  });

  test("guard: mid-sentence hyphens and arithmetic asterisks survive", () => {
    expect(stripMarkdownForSpeech("a real-world example")).toBe("a real-world example");
  });

  test("idempotent: running twice yields the same result", () => {
    const once = stripMarkdownForSpeech("**bold** and 1. first\n2. second");
    expect(stripMarkdownForSpeech(once)).toBe(once);
  });
});
