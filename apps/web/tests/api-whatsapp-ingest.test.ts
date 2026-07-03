/**
 * POST /api/whatsapp/ingest — contract guarantee.
 *
 *   - 401 without a valid desktop bearer
 *   - 400 on malformed body
 *   - 200 + { inserted } on a valid batch (upsert path via onConflictDoNothing)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockValidate,
  mockInsert,
  mockValues,
  mockOnConflictDoNothing,
  mockReturning,
} = vi.hoisted(() => {
  const mockReturning = vi.fn().mockResolvedValue([{ id: "row-1" }, { id: "row-2" }]);
  const mockOnConflictDoNothing = vi.fn(() => ({ returning: mockReturning }));
  const mockValues = vi.fn(() => ({ onConflictDoNothing: mockOnConflictDoNothing }));
  const mockInsert = vi.fn(() => ({ values: mockValues }));
  return {
    mockValidate: vi.fn(),
    mockInsert,
    mockValues,
    mockOnConflictDoNothing,
    mockReturning,
  };
});

vi.mock("@/lib/db", () => ({ db: { insert: mockInsert } }));
vi.mock("@/lib/db/schema", () => ({
  whatsappMessages: {
    userId: "user_id_col",
    chatJid: "chat_jid_col",
    externalId: "external_id_col",
    id: "id_col",
  },
}));
vi.mock("@/lib/auth/desktop-bearer", () => ({
  validateDesktopBearerIdentity: mockValidate,
}));

import { POST } from "@/app/api/whatsapp/ingest/route";

function makeReq(body: unknown, opts: { auth?: boolean } = {}): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.auth) headers["authorization"] = "Bearer hpd_test";
  return new Request("http://localhost/api/whatsapp/ingest", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("POST /api/whatsapp/ingest", () => {
  beforeEach(() => {
    mockValidate.mockReset();
    mockInsert.mockClear();
    mockValues.mockClear();
    mockOnConflictDoNothing.mockClear();
    mockReturning.mockClear();
    mockReturning.mockResolvedValue([{ id: "row-1" }, { id: "row-2" }]);
  });
  afterEach(() => vi.clearAllMocks());

  it("returns 401 without a valid desktop bearer", async () => {
    mockValidate.mockResolvedValue(null);
    const req = makeReq({ messages: [] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(req as any);
    expect(res.status).toBe(401);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid body shape", async () => {
    mockValidate.mockResolvedValue({ userId: "u1", deviceName: "MacBook" });
    const req = makeReq({ wrongKey: 123 }, { auth: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(req as any);
    expect(res.status).toBe(400);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("upserts a valid batch and returns { inserted, received }", async () => {
    mockValidate.mockResolvedValue({ userId: "u1", deviceName: "MacBook" });
    const req = makeReq(
      {
        messages: [
          {
            externalId: "wa-1",
            chatJid: "a@s.whatsapp.net",
            chatName: "Alan",
            sender: "a",
            senderName: "Alan",
            fromMe: false,
            body: "hey",
            sentAt: "2026-07-02T10:00:00.000Z",
          },
          {
            externalId: "wa-2",
            chatJid: "a@s.whatsapp.net",
            fromMe: true,
            body: "yeah",
            sentAt: "2026-07-02T10:01:00.000Z",
          },
        ],
      },
      { auth: true },
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ inserted: 2, received: 2 });
    expect(mockInsert).toHaveBeenCalledTimes(1);
    // Assert we passed user_id from the bearer identity, not from the payload
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const firstCall = (mockValues.mock.calls as any[])[0];
    const insertedRows = firstCall?.[0] as Array<Record<string, unknown>>;
    expect(insertedRows).toBeDefined();
    expect(insertedRows.every((r) => r.userId === "u1")).toBe(true);
    expect(insertedRows[0]!.externalId).toBe("wa-1");
    expect(insertedRows[0]!.sentAt).toBeInstanceOf(Date);
    // onConflictDoNothing invoked with a target — safe against replays
    expect(mockOnConflictDoNothing).toHaveBeenCalledTimes(1);
  });

  it("returns 200 with inserted:0 for an empty (but valid) batch", async () => {
    mockValidate.mockResolvedValue({ userId: "u1", deviceName: "MacBook" });
    const req = makeReq({ messages: [] }, { auth: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ inserted: 0 });
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
