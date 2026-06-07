/**
 * POST /api/jarvis/telemetry/voice-stages — Phase 9 / TEL-01 beacon endpoint.
 *
 * Verifies:
 *   1. Auth — 401 when getClaims returns no claims (no DB call).
 *   2. Happy path — 204 with single UPDATE issuing Set on the 3 voice cols
 *      + WHERE id=turnId AND user_id=claims.sub.
 *   3. Malformed body (non-UUID turnId, non-numeric ts) — 400, no DB call.
 *   4. Year-3000 sentinel (ts > Date.now() + 60_000) — 400, no DB call.
 *   5. Year-1970 sentinel (ts < 1_700_000_000_000) — 400, no DB call.
 *   6. Cross-tenant guard — WHERE clause includes BOTH id and userId
 *      (verified by inspecting the captured mock-arg shape).
 *   7. Partial stages — only sent fields appear in the .set() payload.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted spies + state
// ---------------------------------------------------------------------------

const {
  getClaimsMock,
  dbUpdateMock,
  setSpy,
  whereSpy,
  andSpy,
  eqSpy,
} = vi.hoisted(() => {
  const setSpy = vi.fn();
  const whereSpy = vi.fn(async () => undefined);
  const andSpy = vi.fn();
  const eqSpy = vi.fn();
  return {
    getClaimsMock: vi.fn(),
    dbUpdateMock: vi.fn(),
    setSpy,
    whereSpy,
    andSpy,
    eqSpy,
  };
});

// --- Supabase server mock --------------------------------------------------

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getClaims: getClaimsMock },
  })),
}));

// --- DB mock (db.update().set().where()) -----------------------------------

vi.mock("@/lib/db", () => ({
  db: {
    update: dbUpdateMock,
  },
}));

// --- drizzle-orm mock (and/eq return tagged plain objects we can inspect)
// Partial mock — preserve sql/etc. for other modules that import drizzle-orm
// transitively (schema.ts uses sql for default values).

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    and: (...args: unknown[]) => {
      andSpy(...args);
      return { kind: "and", args };
    },
    eq: (col: unknown, val: unknown) => {
      eqSpy(col, val);
      return { kind: "eq", col, val };
    },
  };
});

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const VALID_UUID = "91cd3407-fa17-4f9d-898d-54b3c5638827";
// Safe value within bounds: 2026-01-01
const VALID_TS_MS = new Date("2026-01-01T00:00:00Z").getTime();

function buildRequest(body: unknown): Request {
  return new Request("http://localhost:3000/api/jarvis/telemetry/voice-stages", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  getClaimsMock.mockReset();
  dbUpdateMock.mockReset();
  setSpy.mockReset();
  whereSpy.mockReset().mockResolvedValue(undefined);
  andSpy.mockReset();
  eqSpy.mockReset();

  // Wire chain: db.update().set().where()
  setSpy.mockReturnValue({ where: whereSpy });
  dbUpdateMock.mockReturnValue({ set: setSpy });

  // Authenticated by default
  getClaimsMock.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/jarvis/telemetry/voice-stages — auth", () => {
  it("returns 401 when getClaims returns null claims (no DB call)", async () => {
    getClaimsMock.mockResolvedValue({ data: { claims: null } });
    const { POST } = await import(
      "@/app/api/jarvis/telemetry/voice-stages/route"
    );
    const res = await POST(
      buildRequest({ turnId: VALID_UUID, vadEndAtMs: VALID_TS_MS }),
    );
    expect(res.status).toBe(401);
    expect(dbUpdateMock).not.toHaveBeenCalled();
  });

  it("returns 401 when getClaims errors (no DB call)", async () => {
    getClaimsMock.mockResolvedValue({ error: new Error("auth failed"), data: null });
    const { POST } = await import(
      "@/app/api/jarvis/telemetry/voice-stages/route"
    );
    const res = await POST(
      buildRequest({ turnId: VALID_UUID, vadEndAtMs: VALID_TS_MS }),
    );
    expect(res.status).toBe(401);
    expect(dbUpdateMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/jarvis/telemetry/voice-stages — happy path", () => {
  it("returns 204 + issues UPDATE on all 3 voice columns", async () => {
    const { POST } = await import(
      "@/app/api/jarvis/telemetry/voice-stages/route"
    );
    const res = await POST(
      buildRequest({
        turnId: VALID_UUID,
        vadEndAtMs: VALID_TS_MS,
        ttsFirstByteAtMs: VALID_TS_MS + 1000,
        audioFirstPlayAtMs: VALID_TS_MS + 2000,
      }),
    );

    expect(res.status).toBe(204);
    expect(dbUpdateMock).toHaveBeenCalledTimes(1);
    expect(setSpy).toHaveBeenCalledTimes(1);

    const setArg = setSpy.mock.calls[0][0] as Record<string, Date>;
    expect(setArg.vadEndAt).toBeInstanceOf(Date);
    expect((setArg.vadEndAt as Date).getTime()).toBe(VALID_TS_MS);
    expect(setArg.ttsFirstByteAt).toBeInstanceOf(Date);
    expect((setArg.ttsFirstByteAt as Date).getTime()).toBe(VALID_TS_MS + 1000);
    expect(setArg.audioFirstPlayAt).toBeInstanceOf(Date);
    expect((setArg.audioFirstPlayAt as Date).getTime()).toBe(VALID_TS_MS + 2000);
  });
});

describe("POST /api/jarvis/telemetry/voice-stages — Zod rejection", () => {
  it("returns 400 on missing turnId (no DB call)", async () => {
    const { POST } = await import(
      "@/app/api/jarvis/telemetry/voice-stages/route"
    );
    const res = await POST(buildRequest({ vadEndAtMs: VALID_TS_MS }));
    expect(res.status).toBe(400);
    expect(dbUpdateMock).not.toHaveBeenCalled();
  });

  it("returns 400 on non-UUID turnId (no DB call)", async () => {
    const { POST } = await import(
      "@/app/api/jarvis/telemetry/voice-stages/route"
    );
    const res = await POST(
      buildRequest({ turnId: "not-a-uuid", vadEndAtMs: VALID_TS_MS }),
    );
    expect(res.status).toBe(400);
    expect(dbUpdateMock).not.toHaveBeenCalled();
  });

  it("returns 400 on non-numeric timestamp (no DB call)", async () => {
    const { POST } = await import(
      "@/app/api/jarvis/telemetry/voice-stages/route"
    );
    const res = await POST(
      buildRequest({ turnId: VALID_UUID, vadEndAtMs: "not-a-number" }),
    );
    expect(res.status).toBe(400);
    expect(dbUpdateMock).not.toHaveBeenCalled();
  });

  it("returns 400 on year-3000 sentinel (vadEndAtMs > Date.now() + 60_000)", async () => {
    const { POST } = await import(
      "@/app/api/jarvis/telemetry/voice-stages/route"
    );
    const res = await POST(
      buildRequest({
        turnId: VALID_UUID,
        // 99999999999999 ≈ year 5138 — way past Date.now() + 60s
        vadEndAtMs: 99999999999999,
      }),
    );
    expect(res.status).toBe(400);
    expect(dbUpdateMock).not.toHaveBeenCalled();
  });

  it("returns 400 on year-1970 sentinel (vadEndAtMs < 1_700_000_000_000)", async () => {
    const { POST } = await import(
      "@/app/api/jarvis/telemetry/voice-stages/route"
    );
    const res = await POST(
      buildRequest({
        turnId: VALID_UUID,
        // 1 ms = 1970-01-01 00:00:00.001 — below floor
        vadEndAtMs: 1,
      }),
    );
    expect(res.status).toBe(400);
    expect(dbUpdateMock).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid JSON body", async () => {
    const { POST } = await import(
      "@/app/api/jarvis/telemetry/voice-stages/route"
    );
    const res = await POST(
      new Request("http://localhost:3000/api/jarvis/telemetry/voice-stages", {
        method: "POST",
        body: "not valid json {{{",
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(400);
    expect(dbUpdateMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/jarvis/telemetry/voice-stages — cross-tenant guard", () => {
  it("WHERE clause includes BOTH eq(id, turnId) AND eq(userId, claims.sub)", async () => {
    const { POST } = await import(
      "@/app/api/jarvis/telemetry/voice-stages/route"
    );
    await POST(
      buildRequest({
        turnId: VALID_UUID,
        vadEndAtMs: VALID_TS_MS,
      }),
    );

    expect(whereSpy).toHaveBeenCalledTimes(1);
    const whereArg = (whereSpy.mock.calls[0] as unknown[])[0] as {
      kind: string;
      args: Array<{ kind: string; val: unknown }>;
    };
    expect(whereArg.kind).toBe("and");
    expect(whereArg.args).toHaveLength(2);

    // First eq: id = turnId
    expect(whereArg.args[0].kind).toBe("eq");
    expect(whereArg.args[0].val).toBe(VALID_UUID);

    // Second eq: userId = claims.sub
    expect(whereArg.args[1].kind).toBe("eq");
    expect(whereArg.args[1].val).toBe("user-1");
  });
});

describe("POST /api/jarvis/telemetry/voice-stages — partial stages", () => {
  it("writes only the supplied columns (others NOT in .set payload)", async () => {
    const { POST } = await import(
      "@/app/api/jarvis/telemetry/voice-stages/route"
    );
    const res = await POST(
      buildRequest({
        turnId: VALID_UUID,
        vadEndAtMs: VALID_TS_MS,
        // tts + audio omitted
      }),
    );

    expect(res.status).toBe(204);
    expect(setSpy).toHaveBeenCalledTimes(1);
    const setArg = setSpy.mock.calls[0][0] as Record<string, Date>;
    expect(setArg).toHaveProperty("vadEndAt");
    expect(setArg).not.toHaveProperty("ttsFirstByteAt");
    expect(setArg).not.toHaveProperty("audioFirstPlayAt");
  });

  it("returns 204 with NO DB call when no stage fields supplied", async () => {
    const { POST } = await import(
      "@/app/api/jarvis/telemetry/voice-stages/route"
    );
    const res = await POST(buildRequest({ turnId: VALID_UUID }));
    expect(res.status).toBe(204);
    // setPayload is empty → short-circuit before db.update
    expect(dbUpdateMock).not.toHaveBeenCalled();
  });
});
