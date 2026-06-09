import { beforeEach, describe, expect, it, vi } from "vitest";
import { streamJarvis } from "@/components/jarvis/jarvis-stream-client";

/**
 * Build a mock Response with a ReadableStream emitting the given SSE chunks.
 * `streamJarvis` consumes `response.body` via TextDecoderStream — the chunks
 * are Uint8Array-encoded text/event-stream payloads.
 */
function makeSseResponse(chunks: string[], status = 200): Response {
  const stream = new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(new TextEncoder().encode(c));
      controller.close();
    },
  });
  return new Response(stream, {
    status,
    headers: { "Content-Type": "text/event-stream" },
  });
}

describe("streamJarvis SSE client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("parses 1 text + 1 action + 1 done", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      makeSseResponse([
        `event: text\ndata: {"delta":"Very good, sir."}\n\n`,
        `event: action\ndata: {"toolUseId":"tu_1","name":"create_task","result":{"ok":true,"id":"t1","receipt":{"title":"pick up groceries","priority":"P1"}}}\n\n`,
        `event: done\ndata: {"usage":{"input_tokens":100,"output_tokens":50}}\n\n`,
      ]),
    );

    const onText = vi.fn();
    const onAction = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    await streamJarvis(
      { input: "pick up groceries", history: [] },
      { onText, onAction, onDone, onError },
    );

    expect(onText).toHaveBeenCalledWith("Very good, sir.");
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({
        toolUseId: "tu_1",
        name: "create_task",
        result: expect.objectContaining({ ok: true, id: "t1" }),
      }),
    );
    expect(onDone).toHaveBeenCalledWith({ input_tokens: 100, output_tokens: 50 });
    expect(onError).not.toHaveBeenCalled();
  });

  it("handles 3 parallel actions in one stream", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      makeSseResponse([
        `event: action\ndata: {"toolUseId":"tu_1","name":"create_task","result":{"ok":true,"id":"t1","receipt":{}}}\n\n`,
        `event: action\ndata: {"toolUseId":"tu_2","name":"create_event","result":{"ok":true,"id":"e1","receipt":{}}}\n\n`,
        `event: action\ndata: {"toolUseId":"tu_3","name":"create_capture","result":{"ok":true,"id":"c1","receipt":{}}}\n\n`,
        `event: done\ndata: {"usage":{}}\n\n`,
      ]),
    );

    const onAction = vi.fn();
    const onDone = vi.fn();
    await streamJarvis(
      { input: "x + y + z", history: [] },
      {
        onText: vi.fn(),
        onAction,
        onDone,
        onError: vi.fn(),
      },
    );

    expect(onAction).toHaveBeenCalledTimes(3);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("routes error events to onError; no onDone fires", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      makeSseResponse([
        `event: error\ndata: {"message":"upstream model failure"}\n\n`,
      ]),
    );

    const onDone = vi.fn();
    const onError = vi.fn();
    await streamJarvis(
      { input: "test", history: [] },
      { onText: vi.fn(), onAction: vi.fn(), onDone, onError },
    );

    expect(onError).toHaveBeenCalledWith("upstream model failure");
    expect(onDone).not.toHaveBeenCalled();
  });

  it("surfaces non-OK HTTP status via onError", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Unauthorized", { status: 401 }),
    );
    const onError = vi.fn();
    await streamJarvis(
      { input: "test", history: [] },
      { onText: vi.fn(), onAction: vi.fn(), onDone: vi.fn(), onError },
    );
    expect(onError).toHaveBeenCalledWith(expect.stringContaining("401"));
  });

  it("handles split SSE frames across multiple TextDecoderStream chunks", async () => {
    // Frame split across the boundary between two enqueued bytes — exercises
    // the buffer/scan loop in streamJarvis.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      makeSseResponse([
        `event: text\ndata: {"de`,
        `lta":"split"}\n\n` +
          `event: done\ndata: {"usage":{}}\n\n`,
      ]),
    );
    const onText = vi.fn();
    const onDone = vi.fn();
    await streamJarvis(
      { input: "x", history: [] },
      { onText, onAction: vi.fn(), onDone, onError: vi.fn() },
    );
    expect(onText).toHaveBeenCalledWith("split");
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("AbortController.abort() before fetch yields aborted error", async () => {
    const ac = new AbortController();
    ac.abort();
    vi.spyOn(globalThis, "fetch").mockImplementation(
      (_url: string | URL | Request, init?: RequestInit) => {
        // Simulate fetch honouring the abort signal.
        if (init?.signal?.aborted) {
          const err: any = new Error("aborted");
          err.name = "AbortError";
          return Promise.reject(err);
        }
        return Promise.resolve(makeSseResponse([]));
      },
    );
    const onError = vi.fn();
    await streamJarvis(
      { input: "x", history: [] },
      { onText: vi.fn(), onAction: vi.fn(), onDone: vi.fn(), onError },
      ac.signal,
    );
    expect(onError).toHaveBeenCalledWith("aborted");
  });

  it("posts the correct method, headers, and body", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(makeSseResponse([`event: done\ndata: {"usage":{}}\n\n`]));

    await streamJarvis(
      {
        input: "pick up groceries",
        history: [{ role: "user", content: "hi" }],
        linkedProjectIds: ["proj-1"],
        linkedHashtags: ["idea"],
      },
      { onText: vi.fn(), onAction: vi.fn(), onDone: vi.fn(), onError: vi.fn() },
    );

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/jarvis",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "X-Voice-Active": "false",
        }),
      }),
    );
    const callInit = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(callInit.body));
    expect(body.input).toBe("pick up groceries");
    expect(body.linkedProjectIds).toEqual(["proj-1"]);
    expect(body.linkedHashtags).toEqual(["idea"]);
  });
});
