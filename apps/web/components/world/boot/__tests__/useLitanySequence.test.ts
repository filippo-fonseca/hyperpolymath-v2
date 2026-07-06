import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  composeGreeting,
  decideLitanyMode,
  litanySchedule,
  staggerStep,
  BOUGH_OFFSET,
  LITANY_SESSION_KEY,
  STAGGER_BASE_START,
} from "../useLitanySequence";

// ── §4 · litanySchedule truth table ──────────────────────────────────────────
describe("litanySchedule", () => {
  // The memo's exact cases: last ignition must always start ≤ 2800.
  const CASES = [1, 2, 6, 9, 12];

  for (const n of CASES) {
    describe(`N=${n}`, () => {
      const { inlayStart, boughStart } = litanySchedule(n);

      it("emits one start per bough", () => {
        expect(inlayStart).toHaveLength(n);
        expect(boughStart).toHaveLength(n);
      });

      it("starts the first inlay at the base (900)", () => {
        expect(inlayStart[0]).toBe(STAGGER_BASE_START);
      });

      it("keeps the last ignition ≤ 2800 ms", () => {
        expect(inlayStart[inlayStart.length - 1]).toBeLessThanOrEqual(2800);
      });

      it("is monotonically non-decreasing", () => {
        for (let i = 1; i < inlayStart.length; i++) {
          expect(inlayStart[i]!).toBeGreaterThanOrEqual(inlayStart[i - 1]!);
        }
      });

      it("kindles each bough exactly 450 ms after its inlay", () => {
        for (let i = 0; i < n; i++) {
          expect(boughStart[i]! - inlayStart[i]!).toBeCloseTo(BOUGH_OFFSET, 6);
        }
      });
    });
  }

  it("uses a zero step for a single bough", () => {
    expect(staggerStep(1)).toBe(0);
    expect(staggerStep(0)).toBe(0);
    expect(litanySchedule(1).inlayStart).toEqual([900]);
    expect(litanySchedule(1).boughStart).toEqual([1350]);
  });

  it("caps the step at 320 ms for few boughs", () => {
    // N=6 → 1900/5 = 380, capped to 320.
    expect(staggerStep(6)).toBe(320);
    expect(litanySchedule(6).inlayStart).toEqual([
      900, 1220, 1540, 1860, 2180, 2500,
    ]);
  });

  it("compresses the step for many boughs so the last start stays ≤ 2800", () => {
    // N=9 → 1900/8 = 237.5; last = 900 + 8·237.5 = 2800.
    expect(staggerStep(9)).toBeCloseTo(237.5, 6);
    const nine = litanySchedule(9);
    expect(nine.inlayStart[8]!).toBeCloseTo(2800, 6);
    // N=12 → 1900/11 ≈ 172.7; last still exactly 2800.
    expect(litanySchedule(12).inlayStart[11]!).toBeCloseTo(2800, 6);
  });
});

// ── §6 · composeGreeting ──────────────────────────────────────────────────────
describe("composeGreeting", () => {
  it("says 'Good morning' before noon", () => {
    // Local time constructor → getHours() is deterministic. Mon Jul 6 2026, 9am.
    expect(composeGreeting(new Date(2026, 6, 6, 9, 0, 0))).toBe(
      "Good morning. Monday, July 6th.",
    );
  });

  it("says 'Good afternoon' between noon and 18:00", () => {
    expect(composeGreeting(new Date(2026, 6, 6, 14, 30, 0))).toBe(
      "Good afternoon. Monday, July 6th.",
    );
  });

  it("says 'Good evening' from 18:00 onward", () => {
    expect(composeGreeting(new Date(2026, 6, 6, 20, 0, 0))).toBe(
      "Good evening. Monday, July 6th.",
    );
  });

  it("switches at the noon / 18:00 boundaries exactly", () => {
    expect(composeGreeting(new Date(2026, 6, 6, 11, 59, 59))).toContain(
      "Good morning",
    );
    expect(composeGreeting(new Date(2026, 6, 6, 12, 0, 0))).toContain(
      "Good afternoon",
    );
    expect(composeGreeting(new Date(2026, 6, 6, 17, 59, 59))).toContain(
      "Good afternoon",
    );
    expect(composeGreeting(new Date(2026, 6, 6, 18, 0, 0))).toContain(
      "Good evening",
    );
  });

  it("formats the date with weekday, month, and ordinal day", () => {
    // New Year's Day 2026 is a Thursday; ordinal "1st".
    expect(composeGreeting(new Date(2026, 0, 1, 10, 0, 0))).toBe(
      "Good morning. Thursday, January 1st.",
    );
    // 23rd → ordinal "rd".
    expect(composeGreeting(new Date(2026, 11, 23, 20, 0, 0))).toBe(
      "Good evening. Wednesday, December 23rd.",
    );
  });
});

// ── §1 · decideLitanyMode ─────────────────────────────────────────────────────
describe("decideLitanyMode", () => {
  function mockReducedMotion(matches: boolean): void {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;
  }

  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.sessionStorage.clear();
  });

  it("returns 'play' on a cold first visit (no reduced motion, no flag)", () => {
    mockReducedMotion(false);
    expect(decideLitanyMode()).toBe("play");
  });

  it("returns 'instant' when reduced motion is preferred", () => {
    mockReducedMotion(true);
    expect(decideLitanyMode()).toBe("instant");
  });

  it("prefers reduced motion even when the flag is unset", () => {
    mockReducedMotion(true);
    window.sessionStorage.removeItem(LITANY_SESSION_KEY);
    expect(decideLitanyMode()).toBe("instant");
  });

  it("returns 'instant' on a same-session revisit (flag present)", () => {
    mockReducedMotion(false);
    window.sessionStorage.setItem(LITANY_SESSION_KEY, "1");
    expect(decideLitanyMode()).toBe("instant");
  });

  it("treats a storage read error as unplayed → 'play'", () => {
    mockReducedMotion(false);
    const spy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("storage blocked");
      });
    expect(decideLitanyMode()).toBe("play");
    spy.mockRestore();
  });

  it("treats a matchMedia error as motion-allowed and reads the flag", () => {
    window.matchMedia = vi.fn().mockImplementation(() => {
      throw new Error("matchMedia unavailable");
    }) as unknown as typeof window.matchMedia;
    // No flag → play.
    expect(decideLitanyMode()).toBe("play");
    // Flag set → instant.
    window.sessionStorage.setItem(LITANY_SESSION_KEY, "1");
    expect(decideLitanyMode()).toBe("instant");
  });
});
