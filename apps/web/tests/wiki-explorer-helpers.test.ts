/**
 * Pure helpers behind the WikiExplorer: item building + comparator layering +
 * ancestry labels + drop-id parsing + selection-range math. These are the
 * routines that keep the Explorer honest under sort + folder navigation +
 * multi-select drag; they intentionally avoid React so they can be exercised
 * without a DOM.
 */

import { describe, expect, it } from "vitest";
import {
  ancestryLabelFor,
  buildExplorerItems,
  computeFolderItemCounts,
  computeSearchHits,
  parseExplorerDragId,
  parseExplorerDropId,
} from "@/components/wiki/explorer-hooks/explorer-items";
import { rangeBetween } from "@/components/wiki/explorer-hooks/useExplorerSelection";
import type { PageWithProjects } from "@/lib/db/queries/pages";
import type { FolderRow } from "@/lib/pages/folder-projects";

function folder(
  id: string,
  parentId: string | null,
  name: string,
  positionKey: string | null = null,
): FolderRow {
  return { id, parentId, name, orderIndex: 0, positionKey };
}

function page(
  id: string,
  folderId: string | null,
  title: string,
  extra: Partial<PageWithProjects> = {},
): PageWithProjects {
  const now = new Date("2026-07-10T12:00:00Z");
  return {
    id,
    title,
    content: "",
    contentJson: null,
    emoji: null,
    url: null,
    pinned: false,
    coverImageUrl: null,
    coverImageAttribution: null,
    noExport: false,
    folderId,
    folderName: null,
    positionKey: null,
    dailyDate: null,
    createdAt: now,
    updatedAt: now,
    projects: [],
    fields: [],
    ...extra,
  };
}

describe("parseExplorerDropId", () => {
  it("decodes folder + breadcrumb + root sentinels", () => {
    expect(parseExplorerDropId("folder:abc")).toEqual({ kind: "folder", id: "abc" });
    expect(parseExplorerDropId("breadcrumb:x")).toEqual({ kind: "folder", id: "x" });
    expect(parseExplorerDropId("breadcrumb-root")).toEqual({ kind: "root" });
    expect(parseExplorerDropId("wiki-root-zone")).toEqual({ kind: "root" });
    expect(parseExplorerDropId("nope")).toBeNull();
  });
});

describe("parseExplorerDragId", () => {
  it("decodes page + folder drag ids", () => {
    expect(parseExplorerDragId("page:1")).toEqual({ kind: "page", id: "1" });
    expect(parseExplorerDragId("folder:2")).toEqual({ kind: "folder", id: "2" });
    expect(parseExplorerDragId("garbage")).toBeNull();
  });
});

describe("rangeBetween (selection)", () => {
  it("returns just b when anchor is null", () => {
    expect(rangeBetween(null, "b", ["a", "b", "c"])).toEqual(["b"]);
  });
  it("returns closed range regardless of anchor direction", () => {
    expect(rangeBetween("a", "c", ["a", "b", "c"])).toEqual(["a", "b", "c"]);
    expect(rangeBetween("c", "a", ["a", "b", "c"])).toEqual(["a", "b", "c"]);
  });
  it("stale anchor → falls back to just b", () => {
    expect(rangeBetween("gone", "b", ["a", "b", "c"])).toEqual(["b"]);
  });
});

describe("computeFolderItemCounts", () => {
  it("counts direct sub-folders + pages per folder", () => {
    const folders = [folder("f1", null, "F1"), folder("f2", "f1", "F2")];
    const pages = [page("p1", "f1", "P1"), page("p2", "f2", "P2"), page("p3", null, "P3")];
    const counts = computeFolderItemCounts(folders, pages);
    expect(counts.get("f1")).toBe(2);
    expect(counts.get("f2")).toBe(1);
    expect(counts.has("root")).toBe(false);
  });
});

describe("buildExplorerItems", () => {
  const folders = [
    folder("f-a", null, "Alpha"),
    folder("f-b", null, "Beta"),
    folder("f-c", "f-a", "Gamma"),
  ];
  const pages = [
    page("p1", null, "Zero note", { updatedAt: new Date("2026-07-05") }),
    page("p2", null, "Apple note", { updatedAt: new Date("2026-07-10"), pinned: true }),
    page("p3", null, "Mid note", { updatedAt: new Date("2026-07-08") }),
    page("p4", "f-a", "Inside note"),
    page("d1", null, "Daily", { dailyDate: "2026-07-10" }),
  ];

  it("puts folders before pages in the current folder view", () => {
    const items = buildExplorerItems(folders, pages, null, "name");
    expect(items[0].kind).toBe("folder");
    expect(items.filter((it) => it.kind === "folder").length).toBe(2);
  });

  it("excludes daily pages from the flat list", () => {
    const items = buildExplorerItems(folders, pages, null, "name");
    const ids = items.map((it) => it.id);
    expect(ids).not.toContain("d1");
  });

  it("pinned pages float first within pages, regardless of sort mode", () => {
    for (const sort of ["manual", "name", "updated"] as const) {
      const items = buildExplorerItems(folders, pages, null, sort);
      const pageItems = items.filter((it) => it.kind === "page");
      expect(pageItems[0]?.id).toBe("p2");
    }
  });

  it("Updated sort orders unpinned pages by updatedAt desc", () => {
    const items = buildExplorerItems(folders, pages, null, "updated");
    const pageItems = items.filter((it) => it.kind === "page").map((it) => it.id);
    // p2 pinned first; then p3 (Jul 8), then p1 (Jul 5).
    expect(pageItems).toEqual(["p2", "p3", "p1"]);
  });

  it("scopes items to the current folder id", () => {
    const items = buildExplorerItems(folders, pages, "f-a", "name");
    const ids = items.map((it) => it.id);
    expect(ids).toContain("f-c");
    expect(ids).toContain("p4");
    expect(ids).not.toContain("p1");
  });
});

describe("ancestryLabelFor", () => {
  const folders = [
    folder("root", null, "Root"),
    folder("mid", "root", "Mid"),
    folder("leaf", "mid", "Leaf"),
  ];
  it("returns Wiki for a null folder", () => {
    expect(ancestryLabelFor(null, folders)).toBe("Wiki");
  });
  it("stringifies the ancestry root-first", () => {
    expect(ancestryLabelFor("leaf", folders)).toBe("Wiki / Root / Mid / Leaf");
  });
  it("cycle-safe when the parent chain loops", () => {
    const looped: FolderRow[] = [
      folder("a", "b", "A"),
      folder("b", "a", "B"),
    ];
    expect(() => ancestryLabelFor("a", looped)).not.toThrow();
  });
});

describe("computeSearchHits", () => {
  const folders = [folder("g", null, "General")];
  const pages = [
    page("p1", "g", "Hello world"),
    page("p2", null, "Goodbye"),
    page("d1", null, "Daily", { dailyDate: "2026-07-10" }),
  ];
  it("matches on title, case-insensitive", () => {
    const hits = computeSearchHits(pages, folders, "HELLO");
    expect(hits.map((h) => h.page.id)).toEqual(["p1"]);
    expect(hits[0].location).toBe("Wiki / General");
  });
  it("skips daily pages", () => {
    const hits = computeSearchHits(pages, folders, "daily");
    expect(hits).toEqual([]);
  });
  it("empty query short-circuits", () => {
    expect(computeSearchHits(pages, folders, "  ")).toEqual([]);
  });
});
