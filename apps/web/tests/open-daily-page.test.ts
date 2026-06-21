/**
 * openDailyPage server action — idempotent, race-safe open (Phase 30,
 * WIKI-DAILY-02).
 *
 * Pins the dedup logic without a real DB by mocking Drizzle's select/insert
 * chains:
 *   1. Existing day -> fast path returns the existing id, NO insert.
 *   2. New day -> guarded INSERT ... ON CONFLICT DO NOTHING then re-SELECT,
 *      returning the freshly-created id, with daily_date + title on the insert.
 *   3. Invalid date -> validation error, no DB access.
 *   4. Unauthenticated -> "Not authenticated".
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getClaimsMock,
  selectResults,
  insertValuesSpy,
  onConflictSpy,
} = vi.hoisted(() => ({
  getClaimsMock: vi.fn(),
  // FIFO queue of rows each successive db.select(...) chain resolves to.
  selectResults: [] as Array<Array<{ id: string }>>,
  insertValuesSpy: vi.fn(),
  onConflictSpy: vi.fn(async () => undefined),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getClaims: getClaimsMock } }),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => selectResults.shift() ?? [],
        }),
      }),
    }),
    insert: () => ({
      values: (payload: unknown) => {
        insertValuesSpy(payload);
        return { onConflictDoNothing: onConflictSpy };
      },
    }),
  },
}));

// schema is referenced for columns/conflict target; a shallow stub suffices.
vi.mock("@/lib/db/schema", () => ({
  pages: {
    id: "pages.id",
    userId: "pages.user_id",
    dailyDate: "pages.daily_date",
  },
  pageFolders: {},
  pagesProjects: {},
  projects: {},
}));

// queries/pages is imported by the action module; stub the named exports it uses.
vi.mock("@/lib/db/queries/pages", () => ({
  getPagesForUser: vi.fn(),
  getDailyPagesForUser: vi.fn(),
}));

import { openDailyPage } from "@/app/actions/pages";

const USER = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  getClaimsMock.mockReset();
  getClaimsMock.mockResolvedValue({ data: { claims: { sub: USER } }, error: null });
  selectResults.length = 0;
  insertValuesSpy.mockClear();
  onConflictSpy.mockClear();
});

describe("openDailyPage", () => {
  it("returns the existing page id without inserting when the day already exists", async () => {
    selectResults.push([{ id: "existing-id" }]); // fast-path SELECT hits.

    const res = await openDailyPage({ date: "2026-06-21" });

    expect(res).toEqual({ success: true, data: { id: "existing-id" } });
    expect(insertValuesSpy).not.toHaveBeenCalled();
  });

  it("creates the page (idempotent insert) then returns its id when the day is new", async () => {
    selectResults.push([]); // fast-path SELECT misses.
    selectResults.push([{ id: "new-id" }]); // re-SELECT after the guarded insert.

    const res = await openDailyPage({ date: "2026-06-21" });

    expect(res).toEqual({ success: true, data: { id: "new-id" } });
    expect(insertValuesSpy).toHaveBeenCalledTimes(1);
    const payload = insertValuesSpy.mock.calls[0]![0] as {
      userId: string;
      dailyDate: string;
      title: string;
    };
    expect(payload.userId).toBe(USER);
    expect(payload.dailyDate).toBe("2026-06-21");
    // Title is the formatted calendar day.
    expect(payload.title).toBe("Sunday, June 21, 2026");
    expect(onConflictSpy).toHaveBeenCalledTimes(1);
  });

  it("rejects a malformed date without touching the DB", async () => {
    const res = await openDailyPage({ date: "06/21/2026" });
    expect(res.success).toBe(false);
    expect(insertValuesSpy).not.toHaveBeenCalled();
  });

  it("rejects when unauthenticated", async () => {
    getClaimsMock.mockResolvedValue({ data: null, error: new Error("nope") });
    const res = await openDailyPage({ date: "2026-06-21" });
    expect(res).toEqual({ success: false, error: "Not authenticated" });
  });
});
