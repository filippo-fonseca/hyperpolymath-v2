/**
 * Folder → project inheritance, pinned as an order-independent property.
 *
 * The link between a folder and a project lives in one junction row, and every
 * consumer resolves the subtree by walking ancestors at read time. That is what
 * makes "link the parent, then add the pages" and "add the pages, then link the
 * parent" land in the same place. These tests exist so a future optimisation
 * that snapshots the effective set at write time fails loudly here first.
 */

import { describe, expect, it } from "vitest";

import {
  type FolderWithProjects,
  getEffectiveProjectIds,
  getInheritedProjectIds,
} from "@/lib/pages/folder-projects";
import type { PageWithProjects } from "@/lib/db/queries/pages";
import { buildPagesTree } from "@/lib/pages/tree";
import type { FolderProjectLink, FolderRow } from "@/lib/pages/folder-projects";

function folder(id: string, parentId: string | null): FolderRow {
  return { id, parentId, name: id, orderIndex: 0 };
}

function page(id: string, folderId: string | null): PageWithProjects {
  const now = new Date("2026-08-09T00:00:00Z");
  return {
    id,
    title: id,
    content: "",
    contentJson: null,
    emoji: null,
    pinned: false,
    url: null,
    coverImageUrl: null,
    coverImageAttribution: null,
    noExport: false,
    folderId,
    folderName: folderId,
    dailyDate: null,
    positionKey: null,
    createdAt: now,
    updatedAt: now,
    projects: [],
    fields: [],
  };
}

function withOwnLinks(folders: FolderRow[], links: FolderProjectLink[]) {
  const map = new Map<string, FolderWithProjects>(
    folders.map((f) => [f.id, { ...f, ownProjectIds: [] }])
  );
  for (const link of links) map.get(link.folderId)?.ownProjectIds.push(link.projectId);
  return map;
}

// root ─ mid ─ leaf, with one page in each of mid and leaf.
const folders = [folder("root", null), folder("mid", "root"), folder("leaf", "mid")];
const pages = [page("p-mid", "mid"), page("p-leaf", "leaf"), page("p-loose", null)];

describe("folder → project inheritance", () => {
  it("cascades a parent's link to every descendant folder", () => {
    const map = withOwnLinks(folders, [{ folderId: "root", projectId: "proj" }]);

    expect(getEffectiveProjectIds("root", map)).toEqual(["proj"]);
    expect(getEffectiveProjectIds("mid", map)).toEqual(["proj"]);
    expect(getEffectiveProjectIds("leaf", map)).toEqual(["proj"]);
    // The link is the ancestor's, so only the descendants call it inherited.
    expect(getInheritedProjectIds("root", map)).toEqual([]);
    expect(getInheritedProjectIds("leaf", map)).toEqual(["proj"]);
  });

  it("reaches a subfolder created after the parent was linked, and one created before", () => {
    const linkFirst = withOwnLinks(folders, [{ folderId: "root", projectId: "proj" }]);
    // A folder added later is just another row in the same walk.
    const laterChild = folder("added-later", "leaf");
    linkFirst.set("added-later", { ...laterChild, ownProjectIds: [] });

    expect(getEffectiveProjectIds("added-later", linkFirst)).toEqual(["proj"]);

    // And the reverse order: the whole tree exists, the link arrives afterwards.
    const treeFirst = withOwnLinks([...folders, laterChild], []);
    expect(getEffectiveProjectIds("added-later", treeFirst)).toEqual([]);
    treeFirst.get("root")?.ownProjectIds.push("proj");
    expect(getEffectiveProjectIds("added-later", treeFirst)).toEqual(["proj"]);
  });

  it("gives every page under a linked folder the project, whenever the link was made", () => {
    const linked = buildPagesTree(folders, [{ folderId: "root", projectId: "proj" }], pages);
    const pagesUnder = (folderId: string) => {
      const find = (nodes: ReturnType<typeof buildPagesTree>["roots"]): string[] =>
        nodes.flatMap((node) =>
          node.id === folderId
            ? node.pages.flatMap((p) => p.projectLinks.map((l) => l.projectId))
            : find(node.subfolders)
        );
      return find(linked.roots);
    };

    expect(pagesUnder("mid")).toEqual(["proj"]);
    expect(pagesUnder("leaf")).toEqual(["proj"]);
    // A page outside the tree stays out of it — inheritance is by placement.
    expect(linked.standalonePages.map((p) => p.projectLinks)).toEqual([[]]);

    // Unlinking is the same computation run again, not a second write path.
    const unlinked = buildPagesTree(folders, [], pages);
    expect(unlinked.roots[0]?.effectiveProjectIds).toEqual([]);
  });

  it("survives a corrupt parent chain instead of looping", () => {
    const cyclic = withOwnLinks(
      [folder("a", "b"), folder("b", "a")],
      [{ folderId: "a", projectId: "proj" }]
    );
    expect(getEffectiveProjectIds("b", cyclic)).toEqual(["proj"]);
  });
});
