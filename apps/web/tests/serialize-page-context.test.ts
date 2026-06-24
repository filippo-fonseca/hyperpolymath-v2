import { describe, expect, it } from "vitest";

import {
  MAX_CONTEXT_CHARS,
  serializePageContext,
} from "@/lib/jarvis/serialize-page-context";
import type { ScopeTarget } from "@/lib/jarvis/scope-resolver";

type FakeBlock = { id: string; text?: string; children?: FakeBlock[] };

/**
 * Fake editor whose blocksToMarkdownLossy joins block ids + text so tests can
 * assert exactly which blocks were serialized — no BlockNote instance needed.
 */
function fakeEditor(document: FakeBlock[]) {
  return {
    document,
    blocksToMarkdownLossy: (blocks: unknown[]) =>
      (blocks as FakeBlock[])
        .map((b) => `${b.id}:${b.text ?? ""}`)
        .join("\n"),
  };
}

function pageScope(blockIds: string[]): ScopeTarget {
  return { kind: "page", blockIds };
}
function blockScope(blockId: string): ScopeTarget {
  return { kind: "block", blockId, blockIds: [blockId] };
}

describe("serializePageContext", () => {
  it("serializes the whole document into pageMarkdown regardless of scope", async () => {
    const doc: FakeBlock[] = [
      { id: "a", text: "alpha" },
      { id: "b", text: "bravo" },
      { id: "c", text: "charlie" },
    ];
    const out = await serializePageContext(fakeEditor(doc), blockScope("b"));
    expect(out.pageMarkdown).toBe("a:alpha\nb:bravo\nc:charlie");
    expect(out.truncated).toBe(false);
  });

  it("targetMarkdown reflects only scope.blockIds", async () => {
    const doc: FakeBlock[] = [
      { id: "a", text: "alpha" },
      { id: "b", text: "bravo" },
      { id: "c", text: "charlie" },
    ];
    const out = await serializePageContext(fakeEditor(doc), blockScope("b"));
    expect(out.targetMarkdown).toBe("b:bravo");
  });

  it("collects children one level deep for sub-block scope", async () => {
    const doc: FakeBlock[] = [
      { id: "a", text: "alpha" },
      {
        id: "list",
        text: "parent",
        children: [
          { id: "c1", text: "one" },
          { id: "c2", text: "two" },
        ],
      },
    ];
    const scope: ScopeTarget = { kind: "sub-block", blockId: "list", blockIds: ["c1", "c2"] };
    const out = await serializePageContext(fakeEditor(doc), scope);
    expect(out.targetMarkdown).toBe("c1:one\nc2:two");
  });

  it("skips block ids not present in the document", async () => {
    const doc: FakeBlock[] = [{ id: "a", text: "alpha" }];
    const scope: ScopeTarget = { kind: "section", blockIds: ["a", "missing"] };
    const out = await serializePageContext(fakeEditor(doc), scope);
    expect(out.targetMarkdown).toBe("a:alpha");
  });

  it("for kind page, targetMarkdown equals pageMarkdown", async () => {
    const doc: FakeBlock[] = [
      { id: "a", text: "alpha" },
      { id: "b", text: "bravo" },
    ];
    const out = await serializePageContext(fakeEditor(doc), pageScope(["a", "b"]));
    expect(out.targetMarkdown).toBe(out.pageMarkdown);
    expect(out.targetMarkdown).toBe("a:alpha\nb:bravo");
  });

  it("sets truncated and appends marker past maxChars", async () => {
    const big = "x".repeat(100);
    const doc: FakeBlock[] = [{ id: "a", text: big }];
    const out = await serializePageContext(fakeEditor(doc), blockScope("a"), {
      maxChars: 20,
    });
    expect(out.truncated).toBe(true);
    expect(out.pageMarkdown.endsWith("[…page truncated…]")).toBe(true);
    expect(out.pageMarkdown.startsWith("a:" + "x".repeat(18))).toBe(true);
  });

  it("leaves content intact under the cap (ceiling, not normal path)", async () => {
    const doc: FakeBlock[] = [{ id: "a", text: "short" }];
    const out = await serializePageContext(fakeEditor(doc), blockScope("a"), {
      maxChars: 1000,
    });
    expect(out.truncated).toBe(false);
    expect(out.pageMarkdown).toBe("a:short");
  });

  it("defaults to MAX_CONTEXT_CHARS as the cap", async () => {
    expect(MAX_CONTEXT_CHARS).toBe(48000);
    const doc: FakeBlock[] = [{ id: "a", text: "z".repeat(MAX_CONTEXT_CHARS + 50) }];
    const out = await serializePageContext(fakeEditor(doc), blockScope("a"));
    expect(out.truncated).toBe(true);
    // "a:" prefix pushes past the cap, so the clip lands at exactly maxChars.
    expect(out.pageMarkdown.length).toBe(MAX_CONTEXT_CHARS + "\n\n[…page truncated…]".length);
  });
});
