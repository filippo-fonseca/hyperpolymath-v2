/**
 * Wiki-home drag-and-drop pure helpers — id encoding + move resolution.
 * Framework-free, no DB. Pins the no-op/cycle rules the tree UI depends on.
 */

import { describe, expect, it } from "vitest";

import type { FolderRow } from "@/lib/pages/folder-projects";
import {
  buildChildrenMap,
  collectSubtreeIds,
  DND_ROOT_ID,
  encodeDraggableId,
  isSelfOrDescendant,
  parseDraggableId,
  parseDroppableId,
  resolveMove,
} from "@/lib/pages/folder-dnd";

function folder(id: string, parentId: string | null): FolderRow {
  return { id, parentId, name: id, orderIndex: 0 };
}

// a ─ b ─ c   (a root, b child of a, c child of b), plus sibling root d.
const folders: FolderRow[] = [
  folder("a", null),
  folder("b", "a"),
  folder("c", "b"),
  folder("d", null),
];
const childrenOf = buildChildrenMap(folders);
const folderParentOf = new Map(folders.map((f) => [f.id, f.parentId] as const));

describe("id encode/parse", () => {
  it("round-trips page and folder ids", () => {
    expect(parseDraggableId(encodeDraggableId({ kind: "page", id: "p1" }))).toEqual({
      kind: "page",
      id: "p1",
    });
    expect(parseDraggableId(encodeDraggableId({ kind: "folder", id: "f1" }))).toEqual({
      kind: "folder",
      id: "f1",
    });
    expect(parseDraggableId("garbage")).toBeNull();
  });

  it("parses droppable targets including the root zone", () => {
    expect(parseDroppableId(DND_ROOT_ID)).toEqual({ kind: "root" });
    expect(parseDroppableId("folder:a")).toEqual({ kind: "folder", id: "a" });
    expect(parseDroppableId("page:p1")).toBeNull();
  });
});

describe("isSelfOrDescendant", () => {
  it("flags self and any descendant", () => {
    expect(isSelfOrDescendant("a", "a", childrenOf)).toBe(true);
    expect(isSelfOrDescendant("a", "b", childrenOf)).toBe(true);
    expect(isSelfOrDescendant("a", "c", childrenOf)).toBe(true);
  });
  it("does not flag unrelated or ancestor folders", () => {
    expect(isSelfOrDescendant("b", "a", childrenOf)).toBe(false);
    expect(isSelfOrDescendant("a", "d", childrenOf)).toBe(false);
  });
});

describe("collectSubtreeIds", () => {
  it("returns the folder plus all descendants", () => {
    expect(collectSubtreeIds("a", childrenOf).sort()).toEqual(["a", "b", "c"]);
    expect(collectSubtreeIds("c", childrenOf)).toEqual(["c"]);
  });
});

describe("resolveMove — pages", () => {
  const pageFolderOf = new Map<string, string | null>([
    ["p1", null],
    ["p2", "a"],
  ]);
  const ctx = { pageFolderOf, folderParentOf, childrenOf };

  it("moves a standalone page into a folder", () => {
    expect(resolveMove({ kind: "page", id: "p1" }, { kind: "folder", id: "a" }, ctx)).toEqual(
      { kind: "page", pageId: "p1", folderId: "a" },
    );
  });
  it("moves a foldered page out to no folder", () => {
    expect(resolveMove({ kind: "page", id: "p2" }, { kind: "root" }, ctx)).toEqual({
      kind: "page",
      pageId: "p2",
      folderId: null,
    });
  });
  it("is a no-op when the page already lives there", () => {
    expect(resolveMove({ kind: "page", id: "p2" }, { kind: "folder", id: "a" }, ctx)).toBeNull();
    expect(resolveMove({ kind: "page", id: "p1" }, { kind: "root" }, ctx)).toBeNull();
  });
});

describe("resolveMove — folders", () => {
  const ctx = {
    pageFolderOf: new Map<string, string | null>(),
    folderParentOf,
    childrenOf,
  };

  it("nests a root folder under another folder", () => {
    expect(resolveMove({ kind: "folder", id: "d" }, { kind: "folder", id: "a" }, ctx)).toEqual({
      kind: "folder",
      folderId: "d",
      parentId: "a",
    });
  });
  it("promotes a nested folder to the top level", () => {
    expect(resolveMove({ kind: "folder", id: "b" }, { kind: "root" }, ctx)).toEqual({
      kind: "folder",
      folderId: "b",
      parentId: null,
    });
  });
  it("rejects moving a folder into itself or a descendant", () => {
    expect(resolveMove({ kind: "folder", id: "a" }, { kind: "folder", id: "a" }, ctx)).toBeNull();
    expect(resolveMove({ kind: "folder", id: "a" }, { kind: "folder", id: "c" }, ctx)).toBeNull();
  });
  it("is a no-op when the folder already has that parent", () => {
    expect(resolveMove({ kind: "folder", id: "b" }, { kind: "folder", id: "a" }, ctx)).toBeNull();
  });
});
