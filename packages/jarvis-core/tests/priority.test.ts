// TEST-02: priority token parser (JARVIS-05).
// Word-boundary matched, case-insensitive. Default P3 when no token present.

import { describe, expect, it } from "vitest";
import { parsePriority } from "../src/parsers/priority";

describe("parsePriority", () => {
  it("recognises 'p1' prefix", () => {
    expect(parsePriority("p1 buy flowers")).toBe("P1");
  });

  it("recognises 'p2' suffix", () => {
    expect(parsePriority("buy flowers p2")).toBe("P2");
  });

  it("recognises 'p3' anywhere", () => {
    expect(parsePriority("p3 buy")).toBe("P3");
  });

  it("'ptop' maps to P∞", () => {
    expect(parsePriority("ptop critical")).toBe("P∞");
  });

  it("'p0' maps to P∞", () => {
    expect(parsePriority("p0 critical")).toBe("P∞");
  });

  it("defaults to P3 when no token present", () => {
    expect(parsePriority("buy flowers")).toBe("P3");
  });

  it("is case-insensitive", () => {
    expect(parsePriority("P1 Stuff")).toBe("P1");
    expect(parsePriority("PTOP Stuff")).toBe("P∞");
  });

  it("word-boundary respected — 'people' must not match 'p' prefix", () => {
    expect(parsePriority("people")).toBe("P3");
  });

  it("word-boundary respected — 'pope' must not match", () => {
    expect(parsePriority("pope said hello")).toBe("P3");
  });

  it("recognises 'p1' immediately after a date phrase (B5 hotfix)", () => {
    expect(parsePriority("surprise for anna 5/16 p1")).toBe("P1");
  });

  it("recognises 'p2' before an SMS-style date abbreviation", () => {
    expect(parsePriority("buy anna flowers p2 tmrw")).toBe("P2");
  });

  it("recognises 'p2' after an M/D date", () => {
    expect(parsePriority("buy anna flowers p2 5/15")).toBe("P2");
  });

  // B-priority-final: end-to-end bug fixtures from user report.
  // Wire break was at the tool description (step 5): the schema description
  // said "priority defaults to P3 if omitted" which encouraged the model to
  // omit the field even when a [SYSTEM-PARSED PRIORITY] hint was present.
  // These fixtures lock in that the parser side returns the correct value;
  // the route + tool description + personality rules together force the
  // model to honour it.
  it("compound input — 'buy roses tomorrow p1 + dinner anna 8pm sat' → P1", () => {
    expect(
      parsePriority("buy roses tomorrow p1 + dinner anna 8pm sat"),
    ).toBe("P1");
  });

  it("date-abbrev neighbour — 'new phone tmrw p2' → P2", () => {
    expect(parsePriority("new phone tmrw p2")).toBe("P2");
  });

  it("must not false-match '8pm' as a priority token", () => {
    // Word-boundary regex protects against the 'pm' suffix in a time looking
    // like a priority token. No token present in the sub-phrase → P3.
    expect(parsePriority("dinner anna 8pm sat")).toBe("P3");
  });
});
