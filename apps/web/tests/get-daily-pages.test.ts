/**
 * getDailyPagesForUser query (Phase 30) — returns lean { id, dailyDate, title }
 * refs for Daily Pages only (daily_date IS NOT NULL), narrowing out any null
 * dailyDate defensively. DB mocked at the Drizzle chain.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { selectRows } = vi.hoisted(() => ({
  selectRows: [] as Array<{ id: string; dailyDate: string | null; title: string }>,
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: async () => selectRows,
        }),
      }),
    }),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  pages: { id: "id", userId: "user_id", dailyDate: "daily_date", title: "title" },
  pageFolders: {},
  pagesProjects: {},
  projects: {},
}));

import { getDailyPagesForUser } from "@/lib/db/queries/pages";

beforeEach(() => {
  selectRows.length = 0;
});

describe("getDailyPagesForUser", () => {
  it("maps rows to { id, dailyDate, title } refs", async () => {
    selectRows.push(
      { id: "p1", dailyDate: "2026-06-20", title: "Saturday, June 20, 2026" },
      { id: "p2", dailyDate: "2026-06-21", title: "Sunday, June 21, 2026" },
    );

    const res = await getDailyPagesForUser("user-1");

    expect(res).toEqual([
      { id: "p1", dailyDate: "2026-06-20", title: "Saturday, June 20, 2026" },
      { id: "p2", dailyDate: "2026-06-21", title: "Sunday, June 21, 2026" },
    ]);
  });

  it("returns an empty list when the user has no Daily Pages", async () => {
    const res = await getDailyPagesForUser("user-1");
    expect(res).toEqual([]);
  });

  it("defensively drops any row with a null dailyDate", async () => {
    selectRows.push(
      { id: "p1", dailyDate: null, title: "shouldn't happen" },
      { id: "p2", dailyDate: "2026-06-21", title: "Sunday, June 21, 2026" },
    );

    const res = await getDailyPagesForUser("user-1");

    expect(res).toEqual([
      { id: "p2", dailyDate: "2026-06-21", title: "Sunday, June 21, 2026" },
    ]);
  });
});
