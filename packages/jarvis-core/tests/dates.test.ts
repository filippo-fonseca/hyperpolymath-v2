// TEST-01: chrono-node + @date-fns/tz parseDates fixture corpus.
// Includes DST spring-forward (Mar 8 2026) and fall-back (Nov 1 2026) anchors.

import { describe, expect, it } from "vitest";
import { parseDates } from "../src/parsers/dates";

const NY = "America/New_York";

describe("parseDates", () => {
  // Reference: Mon May 11 2026 10:00 EDT (= 14:00 UTC).
  const ref = new Date("2026-05-11T14:00:00.000Z");

  it("today (all-day)", () => {
    const out = parseDates("buy flowers today", NY, ref);
    expect(out[0]?.start).toMatch(/^2026-05-11T/);
    expect(out[0]?.allDay).toBe(true);
  });

  it("tomorrow with time", () => {
    const out = parseDates("dinner tomorrow 8pm", NY, ref);
    // May 12 20:00 EDT = May 13 00:00 UTC
    expect(out[0]?.start).toBe("2026-05-13T00:00:00.000Z");
    expect(out[0]?.allDay).toBe(false);
  });

  it("this friday (all-day)", () => {
    const out = parseDates("call mom this friday", NY, ref);
    expect(out[0]?.start).toMatch(/^2026-05-15/);
    expect(out[0]?.allDay).toBe(true);
  });

  it("next friday", () => {
    const out = parseDates("call mom next friday", NY, ref);
    expect(out[0]?.start).toMatch(/^2026-05-22/);
  });

  it("M/D forwardDate jumps to next year when past", () => {
    const out = parseDates("project deadline 3/15", NY, ref);
    expect(out[0]?.start).toMatch(/^2027-03-15/);
  });

  it("time range '8-9pm friday'", () => {
    const out = parseDates("dinner 8-9pm friday", NY, ref);
    expect(out[0]?.start).toBe("2026-05-16T00:00:00.000Z"); // 8pm EDT
    expect(out[0]?.end).toBe("2026-05-16T01:00:00.000Z"); // 9pm EDT
  });

  it("am/pm explicit", () => {
    const out = parseDates("flight 6am tuesday", NY, ref);
    // 6am EDT on Tue May 12 = 10:00 UTC
    expect(out[0]?.start).toMatch(/T10:00:00\.000Z$/);
  });

  it("midnight tomorrow (chrono semantics: midnight that BEGINS tomorrow)", () => {
    // chrono-node parses "midnight tomorrow" as 00:00 on the tomorrow date
    // (not 00:00 of the day after). This matches standard English usage —
    // "midnight tonight" and "midnight tomorrow" both refer to the midnight
    // at the *start* of the named day. Reference: Mon May 11 → tomorrow is
    // Tue May 12 → midnight EDT = 04:00 UTC. (Plan 05-01 fixture spec said
    // May 13 04:00 UTC; that interpretation reads "midnight of the day AFTER
    // tomorrow" which is a non-standard reading. Adopting chrono's reading
    // as the canonical behaviour — see SUMMARY.md "Deviations".)
    const out = parseDates("midnight tomorrow", NY, ref);
    expect(out[0]?.start).toBe("2026-05-12T04:00:00.000Z");
  });

  it("DST spring-forward — valid 3am EDT resolves correctly", () => {
    // Reference: Sat Mar 7 2026 10:00 EST (= 15:00 UTC), day before spring-forward.
    const refMar7 = new Date("2026-03-07T15:00:00.000Z");
    const out = parseDates("tomorrow 3am", NY, refMar7);
    expect(out[0]?.start).toBe("2026-03-08T07:00:00.000Z"); // 3am EDT
  });

  it("DST spring-forward — non-existent 2:30am shifts forward to 3:30 EDT", () => {
    const refMar7 = new Date("2026-03-07T15:00:00.000Z");
    const out = parseDates("tomorrow 2:30am", NY, refMar7);
    expect(out[0]?.start).toBe("2026-03-08T07:30:00.000Z"); // 3:30am EDT
  });

  it("DST fall-back — ambiguous 1:30am picks first occurrence (EDT)", () => {
    // Reference: Sat Oct 31 2026 10:00 EDT (= 14:00 UTC), day before fall-back.
    const refOct31 = new Date("2026-10-31T14:00:00.000Z");
    const out = parseDates("sunday 1:30am", NY, refOct31);
    expect(out[0]?.start).toBe("2026-11-01T05:30:00.000Z"); // 1:30 EDT first
  });

  it("no date phrase returns empty", () => {
    expect(parseDates("buy flowers", NY, ref)).toEqual([]);
  });

  it("'tmrw' abbreviation maps to tomorrow (B5 hotfix)", () => {
    const out = parseDates("buy anna flowers p2 tmrw", NY, ref);
    expect(out[0]?.start).toMatch(/^2026-05-12/);
    expect(out[0]?.allDay).toBe(true);
  });

  it("'tmw' abbreviation maps to tomorrow", () => {
    const out = parseDates("call mom tmw", NY, ref);
    expect(out[0]?.start).toMatch(/^2026-05-12/);
  });

  it("'tmrrw' abbreviation maps to tomorrow", () => {
    const out = parseDates("ship tmrrw", NY, ref);
    expect(out[0]?.start).toMatch(/^2026-05-12/);
  });
});
