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
});
