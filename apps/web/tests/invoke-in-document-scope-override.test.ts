/**
 * invokeInDocumentJarvis scopeOverride path (Phase 30, WIKI-DAILY-04).
 *
 * The Daily Page "process this page" button forces whole-page scope via
 * `scopeOverride: "page"`, bypassing cursor/prompt inference. These tests pin:
 *   1. scopeOverride: "page" serializes every top-level block and POSTs
 *      scope.kind === "page" regardless of cursorBlockId.
 *   2. Without an override, the normal inference still runs (a single cursor
 *      block resolves to scope.kind === "block").
 *
 * serializePageContext is mocked so we assert on the scope handed to it (which
 * is what the route POST mirrors), without pulling in BlockNote.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { serializeMock } = vi.hoisted(() => ({
  serializeMock: vi.fn(),
}));

vi.mock("@/lib/jarvis/serialize-page-context", () => ({
  serializePageContext: serializeMock,
}));

import { invokeInDocumentJarvis } from "@/lib/jarvis/invoke-in-document";
import type { ResolverBlock } from "@/lib/jarvis/scope-resolver";

/** A trivial editor whose document is three top-level paragraphs. */
function makeEditor(): { document: ResolverBlock[]; blocksToMarkdownLossy: () => string } {
  return {
    document: [
      { id: "a", type: "paragraph", content: [{ type: "text", text: "one" }] },
      { id: "b", type: "paragraph", content: [{ type: "text", text: "two" }] },
      { id: "c", type: "paragraph", content: [{ type: "text", text: "three" }] },
    ],
    blocksToMarkdownLossy: () => "md",
  };
}

/** A ReadableStream emitting one SSE "done" record so the invoker resolves. */
function doneStream(): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(enc.encode('event: turn-start\ndata: {"turnId":"t1"}\n\n'));
      controller.enqueue(enc.encode("event: done\ndata: {}\n\n"));
      controller.close();
    },
  });
}

describe("invokeInDocumentJarvis scopeOverride", () => {
  beforeEach(() => {
    serializeMock.mockReset();
    serializeMock.mockResolvedValue({ targetMarkdown: "T", pageMarkdown: "P" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(doneStream(), { status: 200 })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('scopeOverride "page" forces page scope over every block, ignoring the cursor', async () => {
    const editor = makeEditor();
    await invokeInDocumentJarvis({
      editor,
      // A real cursor block that would normally resolve to a single-block scope.
      cursorBlockId: "b",
      scopeOverride: "page",
      prompt: "anything at all",
      pageId: "page-1",
    });

    // serializePageContext is called with the forced page scope.
    expect(serializeMock).toHaveBeenCalledTimes(1);
    const scopeArg = serializeMock.mock.calls[0]![1] as { kind: string; blockIds: string[] };
    expect(scopeArg.kind).toBe("page");
    expect(scopeArg.blockIds).toEqual(["a", "b", "c"]);

    // And the POST body mirrors that scope.
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(body.scope).toEqual({ kind: "page" });
  });

  it("without an override, a cursor block resolves to single-block scope", async () => {
    const editor = makeEditor();
    await invokeInDocumentJarvis({
      editor,
      cursorBlockId: "b",
      prompt: "tighten this",
      pageId: "page-1",
    });

    const scopeArg = serializeMock.mock.calls[0]![1] as { kind: string; blockIds: string[] };
    expect(scopeArg.kind).toBe("block");
    expect(scopeArg.blockIds).toEqual(["b"]);
  });
});
