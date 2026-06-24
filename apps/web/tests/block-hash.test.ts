/**
 * Per-block content hashing for Daily Page re-processing. Framework-free.
 * Pins the determinism + diff rules the "Process this page" skip logic relies on.
 */

import { describe, expect, it } from "vitest";

import type { ResolverBlock } from "@/lib/jarvis/scope-resolver";
import {
  computeBlockHashes,
  diffBlockHashes,
  hashBlock,
} from "@/lib/pages/block-hash";

function block(id: string, text: string, extra?: Partial<ResolverBlock>): ResolverBlock {
  return {
    id,
    type: "paragraph",
    content: [{ type: "text", text }],
    ...extra,
  };
}

describe("hashBlock", () => {
  it("is deterministic for identical content", () => {
    expect(hashBlock(block("a", "hello"))).toBe(hashBlock(block("a", "hello")));
  });

  it("ignores the block's own id (content-only)", () => {
    expect(hashBlock(block("a", "hello"))).toBe(hashBlock(block("b", "hello")));
  });

  it("changes when text content changes", () => {
    expect(hashBlock(block("a", "hello"))).not.toBe(hashBlock(block("a", "world")));
  });

  it("changes when a child's content changes", () => {
    const withChild = (childText: string): ResolverBlock => ({
      id: "p",
      type: "paragraph",
      content: [{ type: "text", text: "parent" }],
      children: [block("c", childText)],
    });
    expect(hashBlock(withChild("one"))).not.toBe(hashBlock(withChild("two")));
  });

  it("is stable across prop key order", () => {
    const a: ResolverBlock = { id: "a", type: "heading", props: { level: 1, x: "y" }, content: [] };
    const b: ResolverBlock = { id: "a", type: "heading", props: { x: "y", level: 1 }, content: [] };
    expect(hashBlock(a)).toBe(hashBlock(b));
  });
});

describe("computeBlockHashes", () => {
  it("maps each top-level block id to its hash", () => {
    const doc = [block("a", "one"), block("b", "two")];
    const hashes = computeBlockHashes(doc);
    expect(Object.keys(hashes).sort()).toEqual(["a", "b"]);
    expect(hashes.a).toBe(hashBlock(block("a", "one")));
  });
});

describe("diffBlockHashes", () => {
  it("treats everything as changed when there is no previous snapshot", () => {
    const next = computeBlockHashes([block("a", "one"), block("b", "two")]);
    const diff = diffBlockHashes(null, next);
    expect(diff.changedBlockIds.sort()).toEqual(["a", "b"]);
    expect(diff.unchangedBlockIds).toEqual([]);
  });

  it("flags only new or modified blocks", () => {
    const prev = computeBlockHashes([block("a", "one"), block("b", "two")]);
    const next = computeBlockHashes([
      block("a", "one"), // unchanged
      block("b", "TWO"), // changed
      block("c", "three"), // new
    ]);
    const diff = diffBlockHashes(prev, next);
    expect(diff.changedBlockIds.sort()).toEqual(["b", "c"]);
    expect(diff.unchangedBlockIds).toEqual(["a"]);
  });

  it("ignores blocks deleted since the previous snapshot", () => {
    const prev = computeBlockHashes([block("a", "one"), block("b", "two")]);
    const next = computeBlockHashes([block("a", "one")]);
    const diff = diffBlockHashes(prev, next);
    expect(diff.changedBlockIds).toEqual([]);
    expect(diff.unchangedBlockIds).toEqual(["a"]);
  });

  it("reports no changes when the document is identical", () => {
    const snap = computeBlockHashes([block("a", "one"), block("b", "two")]);
    const diff = diffBlockHashes(snap, { ...snap });
    expect(diff.changedBlockIds).toEqual([]);
    expect(diff.unchangedBlockIds.sort()).toEqual(["a", "b"]);
  });
});
