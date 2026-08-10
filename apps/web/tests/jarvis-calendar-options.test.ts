/**
 * Jarvis calendar routing — calendar-options module.
 *
 * Verifies:
 *   1. getCalendarOptionsForJarvis returns only writable calendars
 *      (owner/writer) with id/summary/description/primary.
 *   2. Fail-open: any gcal error → [] (a turn must never break because
 *      calendar routing could not load).
 *   3. TTL cache: a second call within the TTL does not re-hit gcal.
 *   4. buildCalendarListBlock: null for ≤1 calendar, deterministic sorted
 *      output otherwise, includes the omit-when-unsure fallback instruction.
 *
 * Mocks: @/lib/gcal/token (getValidGcalToken), @/lib/gcal/calendars
 * (listCalendars). No real Google.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { getValidGcalTokenMock, listCalendarsMock } = vi.hoisted(() => ({
  getValidGcalTokenMock: vi.fn(),
  listCalendarsMock: vi.fn(),
}));

vi.mock("@/lib/gcal/token", () => ({
  getValidGcalToken: getValidGcalTokenMock,
}));

vi.mock("@/lib/gcal/calendars", () => ({
  listCalendars: listCalendarsMock,
}));

import {
  _clearCalendarOptionsCache,
  buildCalendarListBlock,
  getCalendarOptionsForJarvis,
  type JarvisCalendarOption,
} from "@/lib/jarvis/calendar-options";

const USER = "11111111-1111-1111-1111-111111111111";

const GCAL_LIST = [
  {
    id: "primary-id@gmail.com",
    summary: "Personal",
    backgroundColor: "#4285F4",
    foregroundColor: "#FFFFFF",
    primary: true,
    accessRole: "owner",
  },
  {
    id: "yale@group.calendar.google.com",
    summary: "Yale",
    description: "Classes, seminars, and coursework deadlines",
    backgroundColor: "#333333",
    foregroundColor: "#FFFFFF",
    primary: false,
    accessRole: "writer",
  },
  {
    id: "holidays@group.calendar.google.com",
    summary: "Holidays",
    backgroundColor: "#0B8043",
    foregroundColor: "#FFFFFF",
    primary: false,
    accessRole: "reader",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  _clearCalendarOptionsCache();
  getValidGcalTokenMock.mockResolvedValue({} as never);
  listCalendarsMock.mockResolvedValue(GCAL_LIST);
});

describe("getCalendarOptionsForJarvis", () => {
  it("returns writable calendars only, with description and primary flag", async () => {
    const options = await getCalendarOptionsForJarvis(USER);
    expect(options.map((o) => o.id)).toEqual([
      "primary-id@gmail.com",
      "yale@group.calendar.google.com",
    ]);
    expect(options[0].primary).toBe(true);
    expect(options[1].description).toBe(
      "Classes, seminars, and coursework deadlines",
    );
  });

  it("fail-open: gcal error → empty list, no throw", async () => {
    getValidGcalTokenMock.mockRejectedValueOnce(new Error("not connected"));
    await expect(getCalendarOptionsForJarvis(USER)).resolves.toEqual([]);
  });

  it("TTL cache: second call within TTL does not re-fetch", async () => {
    await getCalendarOptionsForJarvis(USER);
    await getCalendarOptionsForJarvis(USER);
    expect(listCalendarsMock).toHaveBeenCalledTimes(1);
  });

  it("errors are not cached — next call retries gcal", async () => {
    getValidGcalTokenMock.mockRejectedValueOnce(new Error("transient"));
    await getCalendarOptionsForJarvis(USER);
    const options = await getCalendarOptionsForJarvis(USER);
    expect(options).toHaveLength(2);
    expect(listCalendarsMock).toHaveBeenCalledTimes(1);
  });
});

describe("buildCalendarListBlock", () => {
  const TWO: JarvisCalendarOption[] = [
    { id: "b@cal", summary: "Yale", description: "Coursework", primary: false },
    { id: "a@cal", summary: "Personal", primary: true },
  ];

  it("≤1 calendar → null (no choice to make)", () => {
    expect(buildCalendarListBlock([])).toBeNull();
    expect(buildCalendarListBlock([TWO[1]])).toBeNull();
  });

  it("renders ids, names, notes, and the omit-when-unsure rule", () => {
    const block = buildCalendarListBlock(TWO);
    expect(block).not.toBeNull();
    expect(block).toContain("USER CALENDARS");
    expect(block).toContain("a@cal\tPersonal\tprimary");
    expect(block).toContain("b@cal\tYale\tCoursework");
    expect(block).toContain("OMIT calendar_id");
  });

  it("deterministic: same input → byte-identical output, sorted by name", () => {
    const a = buildCalendarListBlock(TWO);
    const b = buildCalendarListBlock([...TWO].reverse());
    expect(a).toBe(b);
    expect(a!.indexOf("Personal")).toBeLessThan(a!.indexOf("Yale"));
  });
});
