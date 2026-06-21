import { describe, expect, it } from "vitest";

import {
  resolveScope,
  type ResolverBlock,
} from "@/lib/jarvis/scope-resolver";

/** Build a paragraph block with the given inline text. */
function para(id: string, text = "x"): ResolverBlock {
  return { id, type: "paragraph", content: [{ type: "text", text }] };
}

function heading(id: string, level: number, text = "h"): ResolverBlock {
  return { id, type: "heading", props: { level }, content: [{ type: "text", text }] };
}

describe("resolveScope", () => {
  it("defaults to the single cursor block for a normal paragraph", () => {
    const doc = [para("a"), para("b"), para("c")];
    const t = resolveScope(doc, "b");
    expect(t.kind).toBe("block");
    expect(t.blockIds).toEqual(["b"]);
    expect(t.blockId).toBe("b");
  });

  it("falls back to page when cursorBlockId is null", () => {
    const doc = [para("a"), para("b")];
    const t = resolveScope(doc, null);
    expect(t.kind).toBe("page");
    expect(t.blockIds).toEqual(["a", "b"]);
  });

  it("falls back to page when cursorBlockId is not found", () => {
    const doc = [para("a"), para("b")];
    const t = resolveScope(doc, "zzz");
    expect(t.kind).toBe("page");
    expect(t.blockIds).toEqual(["a", "b"]);
  });

  it("page returns every top-level block id", () => {
    const doc = [para("a"), para("b"), para("c")];
    const t = resolveScope(doc, "a", "process the whole page");
    expect(t.kind).toBe("page");
    expect(t.blockIds).toEqual(["a", "b", "c"]);
  });

  it("section stops at the next heading of equal-or-higher level and includes lower sub-headings", () => {
    // h1(A) p p h2(B) p h1(C) p
    const doc = [
      heading("h1a", 1),
      para("p1"),
      para("p2"),
      heading("h2b", 2),
      para("p3"),
      heading("h1c", 1),
      para("p4"),
    ];
    // cursor inside the first section (a paragraph after the h1)
    const t = resolveScope(doc, "p2", "summarize this section");
    expect(t.kind).toBe("section");
    expect(t.headingId).toBe("h1a");
    // includes the h1, its paragraphs, AND the lower-level h2 + its paragraph,
    // stopping right before the next equal-level h1.
    expect(t.blockIds).toEqual(["h1a", "p1", "p2", "h2b", "p3"]);
    expect(t.blockIds).not.toContain("h1c");
    expect(t.blockIds).not.toContain("p4");
  });

  it("section with no preceding heading falls back to page", () => {
    const doc = [para("a"), para("b")];
    const t = resolveScope(doc, "b", "summarize this section");
    expect(t.kind).toBe("page");
    expect(t.blockIds).toEqual(["a", "b"]);
  });

  it("sub-block returns the cursor block's children ids on a list prompt", () => {
    const list: ResolverBlock = {
      id: "list",
      type: "bulletListItem",
      content: [{ type: "text", text: "parent" }],
      children: [para("c1"), para("c2"), para("c3")],
    };
    const doc = [para("a"), list];
    const t = resolveScope(doc, "list", "turn this list into tasks");
    expect(t.kind).toBe("sub-block");
    expect(t.blockIds).toEqual(["c1", "c2", "c3"]);
    expect(t.blockId).toBe("list");
  });

  it("'this list' with no children falls through to block default (never empty)", () => {
    const doc = [para("a"), para("b")];
    const t = resolveScope(doc, "b", "turn this list into tasks");
    expect(t.kind).toBe("block");
    expect(t.blockIds).toEqual(["b"]);
  });

  it("empty trailing block of a section defaults to the enclosing section", () => {
    const doc = [
      heading("h1", 1),
      para("p1"),
      { id: "empty", type: "paragraph", content: [] } as ResolverBlock,
    ];
    const t = resolveScope(doc, "empty");
    expect(t.kind).toBe("section");
    expect(t.headingId).toBe("h1");
    expect(t.blockIds).toEqual(["h1", "p1", "empty"]);
  });

  it("never returns an empty blockIds array for prompt-driven upgrades", () => {
    const doc = [heading("h1", 1), para("p1")];
    for (const prompt of [
      "summarize this section",
      "process the whole page",
      "turn this list into tasks",
      "do the document",
      "fix everything",
    ]) {
      const t = resolveScope(doc, "p1", prompt);
      expect(t.blockIds.length).toBeGreaterThan(0);
    }
  });
});
