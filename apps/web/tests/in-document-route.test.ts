/**
 * POST /api/jarvis/in-document — Phase 31 engine-integration route.
 *
 * Verifies (mirrors jarvis-route-uses-shared-helper.test.ts):
 *   1. Routes through the shared runJarvisTurnStream (no engine fork) with a
 *      last user message containing the injected IN-DOCUMENT CONTEXT block plus
 *      the targetContext + pageContext.
 *   2. The persisted USER jarvis_turns row text === the original prompt (NOT the
 *      augmented userContent) — D-02.
 *   3. onDone persists an assistant row whose actions carry the FULL
 *      ScrollbackAction shape (status:"done", undone:false) — D-09.
 *   4. Missing claims -> 401, helper never called.
 *   5. Over-long prompt -> 413.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getClaimsMock, runJarvisTurnStreamMock, insertedRows, insertMock } =
  vi.hoisted(() => {
    const insertedRows: Array<Record<string, unknown>> = [];
    const insertMock = vi.fn((_table: unknown) => ({
      values: (row: Record<string, unknown>) => {
        insertedRows.push(row);
        const chain = {
          onConflictDoNothing: () => Promise.resolve(),
          onConflictDoUpdate: () => Promise.resolve(),
        };
        return chain;
      },
    }));
    return {
      getClaimsMock: vi.fn(),
      runJarvisTurnStreamMock: vi.fn(),
      insertedRows,
      insertMock,
    };
  });

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

vi.mock("@/lib/db", () => ({
  db: { insert: insertMock },
}));

vi.mock("@/lib/db/schema", () => ({
  jarvisTurns: { id: "jarvis_turns.id" },
}));

import { POST } from "@/app/api/jarvis/in-document/route";

const USER_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const PAGE_ID = "11111111-1111-4111-8111-111111111111";

function makeReq(body: unknown) {
  return new Request("http://localhost/api/jarvis/in-document", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

async function drain(res: Response) {
  const reader = res.body!.getReader();
  for (;;) {
    const { done } = await reader.read();
    if (done) break;
  }
}

const validBody = {
  prompt: "turn this into tasks",
  scope: { kind: "section" as const },
  targetContext: "TARGET-MD-here",
  pageContext: "PAGE-MD-everything",
  pageId: PAGE_ID,
  history: [],
};

describe("POST /api/jarvis/in-document", () => {
  beforeEach(() => {
    insertedRows.length = 0;
    getClaimsMock.mockResolvedValue({
      data: { claims: { sub: USER_ID } },
      error: null,
    });
    runJarvisTurnStreamMock.mockImplementation(
      async (opts: {
        onTextDelta: (d: string) => void;
        onAction: (id: string, name: string, result: unknown) => void;
        onDone: (usage: unknown) => void;
      }) => {
        opts.onTextDelta("Done, sir.");
        opts.onAction("tu_1", "create_task", {
          ok: true,
          id: "t_1",
          receipt: { title: "a task" },
        });
        opts.onDone({
          input_tokens: 1,
          output_tokens: 1,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        });
      },
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 and never calls the helper without claims", async () => {
    getClaimsMock.mockResolvedValue({ data: null, error: new Error("no session") });
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(401);
    expect(runJarvisTurnStreamMock).not.toHaveBeenCalled();
  });

  it("returns 413 for an over-long prompt", async () => {
    const res = await POST(makeReq({ ...validBody, prompt: "x".repeat(4001) }));
    expect(res.status).toBe(413);
    expect(runJarvisTurnStreamMock).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid body", async () => {
    const res = await POST(makeReq({ prompt: "hi" }));
    expect(res.status).toBe(400);
    expect(runJarvisTurnStreamMock).not.toHaveBeenCalled();
  });

  it("routes through runJarvisTurnStream with injected context on the model message", async () => {
    const res = await POST(makeReq(validBody));
    await drain(res);

    expect(runJarvisTurnStreamMock).toHaveBeenCalledTimes(1);
    const opts = runJarvisTurnStreamMock.mock.calls[0]![0] as {
      userId: string;
      messages: Array<{ role: string; content: string }>;
    };
    expect(opts.userId).toBe(USER_ID);
    const last = opts.messages[opts.messages.length - 1]!;
    expect(last.role).toBe("user");
    expect(last.content).toContain("IN-DOCUMENT CONTEXT");
    expect(last.content).toContain("scope=section");
    expect(last.content).toContain("TARGET-MD-here");
    expect(last.content).toContain("PAGE-MD-everything");
    expect(last.content).toContain(PAGE_ID);
    // The original prompt is still present in the model message.
    expect(last.content).toContain("turn this into tasks");
  });

  it("persists the user turn with the ORIGINAL prompt, not the augmented message", async () => {
    const res = await POST(makeReq(validBody));
    await drain(res);

    const userRow = insertedRows.find((r) => r.kind === "user");
    expect(userRow).toBeDefined();
    expect(userRow!.text).toBe("turn this into tasks");
    expect(userRow!.text).not.toContain("IN-DOCUMENT CONTEXT");
    expect(userRow!.userId).toBe(USER_ID);
    expect(userRow!.actions).toEqual([]);
  });

  it("persists the assistant turn with full ScrollbackAction shape (D-09)", async () => {
    const res = await POST(makeReq(validBody));
    await drain(res);

    const assistantRow = insertedRows.find((r) => r.kind === "assistant");
    expect(assistantRow).toBeDefined();
    expect(assistantRow!.status).toBe("done");
    expect(assistantRow!.textDelta).toBe("Done, sir.");
    const actions = assistantRow!.actions as Array<Record<string, unknown>>;
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      toolUseId: "tu_1",
      name: "create_task",
      status: "done",
      undone: false,
    });
    expect(actions[0]!.result).toMatchObject({ ok: true, id: "t_1" });
  });

  it("streams a turn-start SSE event with a turnId", async () => {
    const res = await POST(makeReq(validBody));
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = "";
    const { value } = await reader.read();
    buf += dec.decode(value, { stream: true });
    expect(buf).toContain("event: turn-start");
    await reader.cancel();
  });
});
