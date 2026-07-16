/**
 * Phase 10 Plan 10-02 — LAT-02 sentence-boundary splitter (TDD RED phase).
 *
 * `splitDeltas(prevBuffer, newDelta)` is a pure function that, given the
 * accumulated tail from prior calls plus the latest streaming delta, returns
 * `{ sentences, remainder }` so the consumer can dispatch each completed
 * sentence to `/api/jarvis/tts` immediately while leaving the unfinished
 * tail for the next call.
 *
 * Boundary detection is the literal regex from REQUIREMENTS / 10-CONTEXT.md
 * D-02: split on `. `, `! `, `? `, or `\n\n`. NO library, NO minimum-length
 * gate, NO abbreviation handling. JARVIS register is butler-clipped; the
 * known-limitation `"Mr. "` false-positive is documented and accepted.
 *
 * These tests are written BEFORE the implementation. All 14 fail at this
 * commit (module not found / symbol not exported) — that is the RED gate.
 */

import { describe, expect, test } from "vitest";
import { splitDeltas } from "@/lib/voice/sentence-splitter";

describe("splitDeltas (LAT-02 sentence boundary)", () => {
  test("empty input pair returns empty sentences and empty remainder", () => {
    expect(splitDeltas("", "")).toEqual({ sentences: [], remainder: "" });
  });

  test("single complete sentence with period+space terminator", () => {
    expect(splitDeltas("", "Filed. ")).toEqual({
      sentences: ["Filed. "],
      remainder: "",
    });
  });

  test("single complete sentence with exclamation+space terminator", () => {
    expect(splitDeltas("", "Done! ")).toEqual({
      sentences: ["Done! "],
      remainder: "",
    });
  });

  test("single complete sentence with question+space terminator", () => {
    expect(splitDeltas("", "Are you sure? ")).toEqual({
      sentences: ["Are you sure? "],
      remainder: "",
    });
  });

  test("single complete sentence with double-newline terminator", () => {
    // The `\n\n` is the terminator, not the `. ` — both appear but the
    // double-newline wins by spanning to end-of-input.
    expect(splitDeltas("", "Paragraph.\n\n")).toEqual({
      sentences: ["Paragraph.\n\n"],
      remainder: "",
    });
  });

  test("no terminator → all text goes to remainder", () => {
    expect(splitDeltas("", "Filed")).toEqual({
      sentences: [],
      remainder: "Filed",
    });
  });

  test("trailing unterminated fragment is retained for the next call", () => {
    expect(splitDeltas("", "Filed. Noted")).toEqual({
      sentences: ["Filed. "],
      remainder: "Noted",
    });
  });

  test("continuation across deltas — boundary spans a delta boundary", () => {
    const r1 = splitDeltas("", "Filed, sir");
    expect(r1).toEqual({ sentences: [], remainder: "Filed, sir" });

    const r2 = splitDeltas(r1.remainder, ". Noted. ");
    expect(r2).toEqual({
      sentences: ["Filed, sir. ", "Noted. "],
      remainder: "",
    });
  });

  test("multiple terminators in one delta emit one sentence per terminator", () => {
    expect(splitDeltas("", "Done. Noted. Filed. ")).toEqual({
      sentences: ["Done. ", "Noted. ", "Filed. "],
      remainder: "",
    });
  });

  test("mixed terminators in one delta (period, exclamation, question)", () => {
    expect(splitDeltas("", "Done! Are you sure? Yes. ")).toEqual({
      sentences: ["Done! ", "Are you sure? ", "Yes. "],
      remainder: "",
    });
  });

  test("double-newline mid-delta splits the paragraph and retains the tail", () => {
    expect(splitDeltas("", "Para one\n\nPara two")).toEqual({
      sentences: ["Para one\n\n"],
      remainder: "Para two",
    });
  });

  test("butler-register single-token sentence dispatches (no minimum-length gate per D-02)", () => {
    expect(splitDeltas("", "Yes. ")).toEqual({
      sentences: ["Yes. "],
      remainder: "",
    });
  });

  test("empty delta keeps prevBuffer unchanged as remainder", () => {
    expect(splitDeltas("partial", "")).toEqual({
      sentences: [],
      remainder: "partial",
    });
  });

  // KNOWN-LIMITATION (10-CONTEXT.md <deferred>): the literal regex `. ` (per D-02)
  // splits abbreviations like "Mr." into a false sentence boundary. JARVIS register
  // is butler-clipped and does not produce these constructions, so the cost is
  // theoretical. Revisit if future quote-back / read-aloud features need it.
  test("known-limitation: abbreviation 'Mr.' splits at false boundary (accepted per D-02)", () => {
    expect(splitDeltas("", "Mr. Stark is here. ")).toEqual({
      sentences: ["Mr. ", "Stark is here. "],
      remainder: "",
    });
  });

  // Unit 3 hardening: the TERMINATOR now also breaks `.!?` immediately followed
  // (NO space) by an uppercase letter or quote, so two glued utterances split
  // into two spoken sentences instead of one run-on blob.
  describe("run-on split (defect 3a) — [.!?] before uppercase/quote", () => {
    test("regression: '…send one.Just Tita, sir. ' splits into two sentences", () => {
      // The exact transcript glue from the bug report: period, NO space, then
      // an uppercase letter. Must NOT be spoken as one run-on fragment.
      const { sentences, remainder } = splitDeltas("", "I can send one.Just Tita, sir. ");
      expect(sentences).toEqual(["I can send one.", "Just Tita, sir. "]);
      expect(remainder).toBe("");
    });

    test("exclamation glued to an uppercase start splits", () => {
      expect(splitDeltas("", "Done!Next up. ")).toEqual({
        sentences: ["Done!", "Next up. "],
        remainder: "",
      });
    });

    test("period glued to an opening quote is a boundary", () => {
      // A dot immediately before an opening quote splits there (the lookahead
      // does not consume the quote, so it opens the next sentence).
      const { sentences } = splitDeltas("", "She said it.'Right away' ");
      expect(sentences[0]).toBe("She said it.");
    });

    // Guard (spec §6): the uppercase-break heuristic must NOT fire inside
    // decimals or lowercase-abbreviation content.
    test("guard: '1.5 hours' is NOT split (digit after the dot)", () => {
      expect(splitDeltas("", "It takes 1.5 hours")).toEqual({
        sentences: [],
        remainder: "It takes 1.5 hours",
      });
    });

    test("guard: 'C. elegans' does not split at the dot before a space+lowercase", () => {
      // "C. elegans" — the dot is followed by a SPACE then lowercase, so only
      // the accepted `. ` abbreviation split can fire, never the new arm; and
      // since a space follows, it matches the plain `. ` terminator (a known,
      // pre-existing abbreviation limitation), not the uppercase-glue arm.
      expect(splitDeltas("", "The worm C.elegans is a model organism")).toEqual({
        sentences: [],
        remainder: "The worm C.elegans is a model organism",
      });
    });
  });
});
