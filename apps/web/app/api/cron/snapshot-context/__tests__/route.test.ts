/**
 * /api/cron/snapshot-context — Vercel cron handler tests.
 *
 * Phase 999.12 CTX-06. The handler:
 *   - returns 401 if Authorization header is absent or wrong
 *   - returns 500 if CRON_SECRET env var isn't configured (fail loud — silent
 *     misconfig would let unauthenticated callers in if we treated it as 401)
 *   - on auth success, loops users, calls buildSnapshot + persistSnapshot per
 *     user, counts wins + failures, returns { ok, snapshots_written, failures }
 *   - failures on one user do NOT abort the loop
 *
 * The buildSnapshot + persistSnapshot + db imports are mocked so the test runs
 * without postgres.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ok, err } from "@/lib/integrations/result";

vi.mock("@/lib/context/build-snapshot", () => ({ buildSnapshot: vi.fn() }));
vi.mock("@/lib/context/persist", () => ({ persistSnapshot: vi.fn() }));

// Mock @/lib/db with a select chain returning the users we set in each test.
const mockUsers: { id: string }[] = [];
vi.mock("@/lib/db", () => ({
  db: {
    select() {
      return {
        from() {
          return Promise.resolve(mockUsers);
        },
      };
    },
  },
}));

import { GET } from "../route";
import { buildSnapshot } from "@/lib/context/build-snapshot";
import { persistSnapshot } from "@/lib/context/persist";

const SECRET = "test-secret-abc123";

beforeEach(() => {
  vi.resetAllMocks();
  mockUsers.length = 0;
  vi.stubEnv("CRON_SECRET", SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function makeReq(authHeader?: string): Request {
  const headers = new Headers();
  if (authHeader) headers.set("authorization", authHeader);
  return new Request("http://localhost/api/cron/snapshot-context", {
    method: "GET",
    headers,
  });
}

describe("GET /api/cron/snapshot-context", () => {
  it("returns 401 when Authorization header is missing", async () => {
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  it("returns 401 when bearer is wrong", async () => {
    const res = await GET(makeReq("Bearer wrong-secret"));
    expect(res.status).toBe(401);
  });

  it("returns 500 when CRON_SECRET is not configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const res = await GET(makeReq("Bearer anything"));
    expect(res.status).toBe(500);
  });

  it("returns 200 with snapshots_written=0 when there are no users", async () => {
    const res = await GET(makeReq(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, snapshots_written: 0, failures: [] });
  });

  it("loops users, calls buildSnapshot + persistSnapshot per user, counts written", async () => {
    const u1 = crypto.randomUUID();
    const u2 = crypto.randomUUID();
    mockUsers.push({ id: u1 }, { id: u2 });

    const fakeSnapshot = {
      schemaVersion: 2 as const,
      generatedAt: new Date().toISOString(),
      nodes: [],
      edges: [],
      meta: {
        totalNodes: 0,
        totalEdges: 0,
        nodeCounts: {},
        excludedNoExportCount: 0,
      },
    };
    vi.mocked(buildSnapshot).mockResolvedValue(ok(fakeSnapshot));
    vi.mocked(persistSnapshot).mockResolvedValue(
      ok({ userId: "x", snapshotDate: "2026-06-09" }),
    );

    const res = await GET(makeReq(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.snapshots_written).toBe(2);
    expect(body.failures).toEqual([]);
    expect(vi.mocked(buildSnapshot)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(persistSnapshot)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(buildSnapshot)).toHaveBeenNthCalledWith(1, u1);
    expect(vi.mocked(buildSnapshot)).toHaveBeenNthCalledWith(2, u2);
  });

  it("records failures per user and continues the loop", async () => {
    const u1 = crypto.randomUUID();
    const u2 = crypto.randomUUID();
    const u3 = crypto.randomUUID();
    mockUsers.push({ id: u1 }, { id: u2 }, { id: u3 });

    const okSnap = {
      schemaVersion: 2 as const,
      generatedAt: new Date().toISOString(),
      nodes: [],
      edges: [],
      meta: {
        totalNodes: 0,
        totalEdges: 0,
        nodeCounts: {},
        excludedNoExportCount: 0,
      },
    };
    vi.mocked(buildSnapshot)
      .mockResolvedValueOnce(ok(okSnap))
      .mockResolvedValueOnce(err("kaboom"))
      .mockResolvedValueOnce(ok(okSnap));
    vi.mocked(persistSnapshot).mockResolvedValue(
      ok({ userId: "x", snapshotDate: "2026-06-09" }),
    );

    const res = await GET(makeReq(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.snapshots_written).toBe(2);
    expect(body.failures).toHaveLength(1);
    expect(body.failures[0]).toMatchObject({ userId: u2, error: "kaboom" });
  });

  it("records failures from persistSnapshot too", async () => {
    const u1 = crypto.randomUUID();
    mockUsers.push({ id: u1 });

    const okSnap = {
      schemaVersion: 2 as const,
      generatedAt: new Date().toISOString(),
      nodes: [],
      edges: [],
      meta: {
        totalNodes: 0,
        totalEdges: 0,
        nodeCounts: {},
        excludedNoExportCount: 0,
      },
    };
    vi.mocked(buildSnapshot).mockResolvedValue(ok(okSnap));
    vi.mocked(persistSnapshot).mockResolvedValue(err("db down"));

    const res = await GET(makeReq(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.snapshots_written).toBe(0);
    expect(body.failures).toEqual([{ userId: u1, error: "db down" }]);
  });
});
