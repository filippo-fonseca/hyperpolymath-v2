/**
 * Issue #55 — projects/classes whose run has ended count as ARCHIVED and must
 * drop out of the live tree + projects page. These tests pin the pure expiry
 * logic: a class ends with its semester, everything else with its end date.
 */
import { describe, expect, it } from "vitest";
import {
  isProjectExpired,
  projectEffectiveEndISO,
  semesterEndISO,
} from "@/lib/projects/archive-status";

const TODAY = "2026-06-16";

describe("semesterEndISO", () => {
  it("ends fall at year-end, spring in May, summer in August", () => {
    expect(semesterEndISO("fall", 2025)).toBe("2025-12-31");
    expect(semesterEndISO("spring", 2026)).toBe("2026-05-31");
    expect(semesterEndISO("summer", 2026)).toBe("2026-08-31");
  });
});

describe("projectEffectiveEndISO", () => {
  it("uses the semester end for a class with semester info", () => {
    expect(
      projectEffectiveEndISO({
        isClass: true,
        endDate: null,
        semesterTerm: "spring",
        semesterYear: 2026,
      }),
    ).toBe("2026-05-31");
  });

  it("falls back to endDate for a non-class project", () => {
    expect(
      projectEffectiveEndISO({
        isClass: false,
        endDate: "2026-01-01",
        semesterTerm: null,
        semesterYear: null,
      }),
    ).toBe("2026-01-01");
  });

  it("uses endDate for a class missing semester info", () => {
    expect(
      projectEffectiveEndISO({
        isClass: true,
        endDate: "2026-02-02",
        semesterTerm: null,
        semesterYear: null,
      }),
    ).toBe("2026-02-02");
  });

  it("is null when nothing bounds the project", () => {
    expect(
      projectEffectiveEndISO({
        isClass: false,
        endDate: null,
        semesterTerm: null,
        semesterYear: null,
      }),
    ).toBeNull();
  });
});

describe("isProjectExpired", () => {
  it("treats a past-semester class as expired", () => {
    expect(
      isProjectExpired(
        { isClass: true, endDate: null, semesterTerm: "spring", semesterYear: 2026 },
        TODAY,
      ),
    ).toBe(true);
  });

  it("keeps an in-progress semester live", () => {
    expect(
      isProjectExpired(
        { isClass: true, endDate: null, semesterTerm: "fall", semesterYear: 2026 },
        TODAY,
      ),
    ).toBe(false);
  });

  it("treats a project past its end date as expired", () => {
    expect(
      isProjectExpired(
        { isClass: false, endDate: "2026-01-01", semesterTerm: null, semesterYear: null },
        TODAY,
      ),
    ).toBe(true);
  });

  it("keeps a future-dated or open-ended project live", () => {
    expect(
      isProjectExpired(
        { isClass: false, endDate: "2026-12-31", semesterTerm: null, semesterYear: null },
        TODAY,
      ),
    ).toBe(false);
    expect(
      isProjectExpired(
        { isClass: false, endDate: null, semesterTerm: null, semesterYear: null },
        TODAY,
      ),
    ).toBe(false);
  });
});
