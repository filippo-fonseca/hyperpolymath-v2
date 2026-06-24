/**
 * POST /api/jarvis — regression guard verifying the route delegates to
 * runJarvisTurnStream (the shared helper). The route must NOT contain its own
 * Anthropic stream loop.
 *
 * Verifies:
 *   1. Successful request calls runJarvisTurnStream with the correct userId.
 *   2. Unauthorized request (no claims) returns 401 and never calls the helper.
 *   3. SSE response includes turn-start event with a turnId.
 *   4. onQueued callback from the helper is forwarded as `queued` SSE event.
 *   5. onAction callback from the helper is forwarded as `action` SSE event.
 *   6. onDone callback from the helper is forwarded as `done` SSE event.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getClaimsMock, runJarvisTurnStreamMock } = vi.hoisted(() => ({
  getClaimsMock: vi.fn(),
  runJarvisTurnStreamMock: vi.fn(),
}));

// --- BYOK key resolver mock ------------------------------------------------
// Routes resolve the caller's own API key before doing work; without this mock
// getUserKey hits the (mocked) db, finds no row, and 402s before any output.
vi.mock("@/lib/byok/keys", () => ({
  getUserKey: vi.fn(async () => "sk-ant-test"),
  getUserKeyOrNull: vi.fn(async () => "sk-ant-test"),
  MissingKeyError: class MissingKeyError extends Error {
    provider: string;
    constructor(provider: string) {
      super(`Missing ${provider} API key for user`);
      this.name = "MissingKeyError";
      this.provider = provider;
    }
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getClaims: getClaimsMock },
  })),
}));

vi.mock("@/lib/jarvis/run-turn", () => ({
  runJarvisTurnStream: runJarvisTurnStreamMock,
}));

import { POST } from "@/app/api/jarvis/route";

const USER_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

async function readSseEvents(res: Response) {
  const events: Array<{ event: string; data: unknown }> = [];
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const chunk of parts) {
      const lines = chunk.split("\n").filter(Boolean);
      let event = "message";
      let data: unknown;
      for (const line of lines) {
        if (line.startsWith("event: ")) event = line.slice(7).trim();
        if (line.startsWith("data: ")) {
          try { data = JSON.parse(line.slice(6)); } catch { data = line.slice(6); }
        }
      }
      if (data !== undefined) events.push({ event, data });
    }
  }
  return events;
}

describe("POST /api/jarvis — delegates to runJarvisTurnStream", () => {
  beforeEach(() => {
    getClaimsMock.mockResolvedValue({
      data: { claims: { sub: USER_ID } },
      error: null,
    });
    runJarvisTurnStreamMock.mockImplementation(async (opts: {
      onTextDelta: (d: string) => void;
      onQueued: (id: string, name: string) => void;
      onAction: (id: string, name: string, result: unknown) => void;
      onDone: (usage: unknown) => void;
    }) => {
      opts.onTextDelta("Hello.");
      opts.onQueued("tu_1", "create_capture");
      opts.onAction("tu_1", "create_capture", { ok: true, id: "c_1", receipt: { content: "note" } });
      opts.onDone({ input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 });
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 and never calls helper when no claims", async () => {
    getClaimsMock.mockResolvedValue({ data: null, error: new Error("no session") });
    const req = new Request("http://localhost/api/jarvis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: "test", history: [] }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(401);
    expect(runJarvisTurnStreamMock).not.toHaveBeenCalled();
  });

  it("calls runJarvisTurnStream with the authed userId", async () => {
    const req = new Request("http://localhost/api/jarvis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: "capture this", history: [] }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    await res.body?.cancel();

    expect(runJarvisTurnStreamMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID }),
    );
  });

  it("SSE stream includes turn-start with a turnId", async () => {
    const req = new Request("http://localhost/api/jarvis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: "test", history: [] }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    const events = await readSseEvents(res);

    const turnStart = events.find((e) => e.event === "turn-start");
    expect(turnStart).toBeDefined();
    expect((turnStart!.data as { turnId?: string }).turnId).toBeTruthy();
  });

  it("forwards helper callbacks as SSE events: queued, action, done", async () => {
    const req = new Request("http://localhost/api/jarvis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: "capture something", history: [] }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    const events = await readSseEvents(res);

    const eventNames = events.map((e) => e.event);
    expect(eventNames).toContain("queued");
    expect(eventNames).toContain("action");
    expect(eventNames).toContain("done");
    expect(eventNames).toContain("text");
  });
});
