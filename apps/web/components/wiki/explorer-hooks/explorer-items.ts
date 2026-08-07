import type { ExplorerItem, ExplorerSortMode } from "@/components/wiki/explorer-types";
import type { ExplorerSearchHit } from "@/components/wiki/explorer-views/ExplorerSearchResults";
import { formatPageLocation } from "@/components/wiki/explorer-views/ExplorerSearchResults";
import type { PageWithProjects } from "@/lib/db/queries/pages";
import type { FolderRow } from "@/lib/pages/folder-projects";
import { compareExplorerItems, withPinnedFirst } from "@/lib/pages/position";

/** Sub-folder + page counts nested under a folder id (direct children only). */
export function computeFolderItemCounts(
  folders: FolderRow[],
  pages: PageWithProjects[]
): Map<string, number> {
  const m = new Map<string, number>();
  for (const f of folders) {
    if (f.parentId) m.set(f.parentId, (m.get(f.parentId) ?? 0) + 1);
  }
  for (const p of pages) {
    if (p.folderId) m.set(p.folderId, (m.get(p.folderId) ?? 0) + 1);
  }
  return m;
}

/**
 * Build the ordered list of items visible in the current folder. Folders come
 * first, then pages; each group is sorted by the chosen mode. Manual sort uses
 * `compareExplorerItems` (position_key NULLS LAST → name); pinned pages always
 * float first, in every sort, via `withPinnedFirst`.
 */
export function buildExplorerItems(
  folders: FolderRow[],
  pages: PageWithProjects[],
  currentFolderId: string | null,
  sort: ExplorerSortMode,
  counts?: Map<string, number>
): ExplorerItem[] {
  const childFolders = folders.filter((f) => (f.parentId ?? null) === currentFolderId);
  const childPages = pages.filter((p) => (p.folderId ?? null) === currentFolderId && !p.dailyDate);

  const folderCounts = counts ?? computeFolderItemCounts(folders, pages);

  // FolderRow's timestamps are optional and may arrive as ISO strings over the
  // wire, so normalize; a folder missing the stamp sorts last rather than
  // throwing the whole list into NaN comparisons.
  const stamp = (v: Date | string | undefined): number =>
    v ? new Date(v).getTime() : 0;

  const sortedFolders = [...childFolders].sort((a, b) => {
    if (sort === "manual") return compareExplorerItems(a, b);
    if (sort === "created") return stamp(b.createdAt) - stamp(a.createdAt);
    if (sort === "updated") return stamp(b.updatedAt) - stamp(a.updatedAt);
    return a.name.localeCompare(b.name);
  });

  const pageCmp = (() => {
    if (sort === "name") {
      return withPinnedFirst<PageWithProjects>((a, b) =>
        a.title.trim().toLowerCase().localeCompare(b.title.trim().toLowerCase())
      );
    }
    if (sort === "updated") {
      return withPinnedFirst<PageWithProjects>(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    }
    // Newest first, same direction as Updated: "when did this appear" is
    // almost always asked about the recent end of the list.
    if (sort === "created") {
      return withPinnedFirst<PageWithProjects>(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    }
    return withPinnedFirst<PageWithProjects>((a, b) =>
      compareExplorerItems(
        { positionKey: a.positionKey ?? null, name: a.title },
        { positionKey: b.positionKey ?? null, name: b.title }
      )
    );
  })();

  const sortedPages = [...childPages].sort(pageCmp);

  const out: ExplorerItem[] = [];
  for (const f of sortedFolders) {
    out.push({ kind: "folder", id: f.id, folder: f, itemCount: folderCounts.get(f.id) ?? 0 });
  }
  for (const p of sortedPages) {
    out.push({ kind: "page", id: p.id, page: p });
  }
  return out;
}

/** Preserve the sort order produced above while making the two Drive-style
 * render bands explicit. This also protects views from accidental interleave. */
export function partitionExplorerItems(items: ExplorerItem[]): {
  folders: Extract<ExplorerItem, { kind: "folder" }>[];
  pages: Extract<ExplorerItem, { kind: "page" }>[];
} {
  const folders: Extract<ExplorerItem, { kind: "folder" }>[] = [];
  const pages: Extract<ExplorerItem, { kind: "page" }>[] = [];
  for (const item of items) {
    if (item.kind === "folder") folders.push(item);
    else pages.push(item);
  }
  return { folders, pages };
}

/**
 * Flat cross-wiki search: match title + emoji + folder ancestry. Daily pages
 * excluded — Wave 3 owns the daily surface. Query is trimmed + lowercased.
 */
export function computeSearchHits(
  allPages: PageWithProjects[],
  folders: FolderRow[],
  rawQuery: string
): ExplorerSearchHit[] {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return [];
  const hits: ExplorerSearchHit[] = [];
  for (const page of allPages) {
    if (page.dailyDate) continue;
    const title = (page.title || "Untitled").toLowerCase();
    if (!title.includes(q)) continue;
    hits.push({ page, location: formatPageLocation(page, folders) });
  }
  return hits;
}

/**
 * Compute the ancestry label ("Wiki / Foo / Bar") for a folder id, matching
 * the inspector's "Location" row. Cycle-safe.
 */
export function ancestryLabelFor(folderId: string | null, folders: FolderRow[]): string {
  if (!folderId) return "Wiki";
  const byId = new Map(folders.map((f) => [f.id, f] as const));
  const chain: string[] = [];
  const seen = new Set<string>();
  let cur: string | null = folderId;
  while (cur && !seen.has(cur)) {
    const row = byId.get(cur);
    if (!row) break;
    seen.add(cur);
    chain.unshift(row.name);
    cur = row.parentId;
  }
  return chain.length > 0 ? `Wiki / ${chain.join(" / ")}` : "Wiki";
}

/**
 * Decode a droppable id back into the intended target for the Explorer's
 * DnD composition. Supports `folder:<id>`, `breadcrumb:<id>`,
 * `breadcrumb-root`, and the shared `wiki-root-zone` sentinel.
 */
export type ExplorerDropTarget = { kind: "folder"; id: string } | { kind: "root" };

export function parseExplorerDropId(raw: string): ExplorerDropTarget | null {
  if (raw === "wiki-root-zone" || raw === "breadcrumb-root") return { kind: "root" };
  if (raw.startsWith("breadcrumb:")) return { kind: "folder", id: raw.slice("breadcrumb:".length) };
  if (raw.startsWith("folder:")) return { kind: "folder", id: raw.slice("folder:".length) };
  return null;
}

/** Decode a draggable id back to `{ kind, id }`. */
export function parseExplorerDragId(raw: string): { kind: "page" | "folder"; id: string } | null {
  if (raw.startsWith("page:")) return { kind: "page", id: raw.slice("page:".length) };
  if (raw.startsWith("folder:")) return { kind: "folder", id: raw.slice("folder:".length) };
  return null;
}
