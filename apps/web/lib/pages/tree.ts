import type {
  FolderProjectLink,
  FolderRow,
} from "@/lib/pages/folder-projects";
import type { PageWithProjects } from "@/lib/db/queries/pages";

export interface TreePage {
  id: string;
  title: string;
  emoji: string | null;
  updatedAt: Date;
  pinned: boolean;
}

/**
 * One project link on a folder node. `isInherited` distinguishes the folder's
 * own links from links it inherits from an ancestor; inherited links are
 * read-only in the UI (Phase 24 enforcement), and `sourceFolder` names the
 * ancestor folder that actually owns the link.
 */
export interface ProjectLink {
  projectId: string;
  isInherited: boolean;
  /** The ancestor folder id that owns an inherited link (undefined when own). */
  sourceFolder?: string;
}

export interface TreeFolder {
  id: string;
  name: string;
  parentId: string | null;
  /** Direct folder_projects links on this folder. */
  ownProjectIds: string[];
  /** Project ids inherited from ancestor folders (deduped). */
  inheritedProjectIds: string[];
  /** own ∪ inherited (deduped). */
  effectiveProjectIds: string[];
  /** own + inherited links with the isInherited / sourceFolder flags. */
  projectLinks: ProjectLink[];
  subfolders: TreeFolder[];
  pages: TreePage[];
}

export interface PagesTree {
  /** Folders with parentId = null. */
  roots: TreeFolder[];
  /** Pages with no folder (pages.folder_id = null). */
  standalonePages: TreePage[];
}

function toTreePage(p: PageWithProjects): TreePage {
  return {
    id: p.id,
    title: p.title,
    emoji: p.emoji,
    updatedAt: p.updatedAt,
    pinned: p.pinned,
  };
}

/** Internal per-folder record used for the ancestor walk. */
interface FolderMeta {
  parentId: string | null;
  ownProjectIds: string[];
}

/**
 * Walk a folder's ancestor chain, collecting each ancestor's OWN project ids
 * together with the ancestor folder that owns them. Cycle-safe via a visited
 * set (the DB CHECK + app-layer guard make true cycles impossible, but the
 * walk is defensive so a corrupt chain can never spin forever — RESEARCH
 * Pitfall 1 / "Don't Hand-Roll").
 */
function walkInherited(
  folderId: string,
  folderMap: Map<string, FolderMeta>,
): ProjectLink[] {
  const links: ProjectLink[] = [];
  const seenProjects = new Set<string>();
  const visited = new Set<string>();
  let current = folderMap.get(folderId)?.parentId ?? null;

  while (current && !visited.has(current)) {
    visited.add(current);
    const ancestor = folderMap.get(current);
    if (!ancestor) break;
    for (const pid of ancestor.ownProjectIds) {
      if (!seenProjects.has(pid)) {
        seenProjects.add(pid);
        links.push({ projectId: pid, isInherited: true, sourceFolder: current });
      }
    }
    current = ancestor.parentId;
  }

  return links;
}

/**
 * Assemble the Pages-home tree as a parent_id folder hierarchy (locked
 * decision 8). Roots are folders with parentId = null; each folder nests its
 * children by parentId. Pages attach to their folder via pages.folder_id;
 * pages with folder_id = null become `standalonePages`.
 *
 * Each folder node carries its effective project set computed by an in-TS
 * ancestor walk (locked decision 7): ownProjectIds (direct folder_projects
 * links), inheritedProjectIds (every ancestor's own links, deduped), and
 * effectiveProjectIds (own ∪ inherited). `projectLinks` exposes both with an
 * isInherited flag and, for inherited links, the owning ancestor (sourceFolder)
 * so phases 23/24 can render inherited links as read-only without a schema
 * change (WIKI-MODEL-05, WIKI-MODEL-06).
 *
 * Pages preserve input order (pinned-first, recent-first); the caller controls
 * sort by ordering `pages`.
 *
 * Future-scale alternative: the ancestor walk could be a single SQL
 * `WITH RECURSIVE` CTE (RESEARCH Decision B) keyed on parent_id, returning each
 * folder's inherited project ids from Postgres directly. The in-TS walk is kept
 * here because the per-user folder count is small and the logic is shared with
 * the query layer (getEffectiveProjectIds in lib/db/queries/folders.ts).
 */
export function buildPagesTree(
  folders: FolderRow[],
  folderProjectLinks: FolderProjectLink[],
  pages: PageWithProjects[],
): PagesTree {
  // Step 1: folderMap of id -> { parentId, ownProjectIds }.
  const folderMap = new Map<string, FolderMeta>();
  for (const f of folders) {
    folderMap.set(f.id, { parentId: f.parentId, ownProjectIds: [] });
  }
  for (const link of folderProjectLinks) {
    folderMap.get(link.folderId)?.ownProjectIds.push(link.projectId);
  }

  // Step 2: bucket pages by folder; collect standalone pages (folder_id null).
  const pagesByFolder = new Map<string, TreePage[]>();
  const standalonePages: TreePage[] = [];
  for (const page of pages) {
    if (page.folderId && folderMap.has(page.folderId)) {
      const list = pagesByFolder.get(page.folderId) ?? [];
      list.push(toTreePage(page));
      pagesByFolder.set(page.folderId, list);
    } else {
      standalonePages.push(toTreePage(page));
    }
  }

  // Step 3: build each folder node with its effective project set.
  const nodes = new Map<string, TreeFolder>();
  for (const f of folders) {
    const meta = folderMap.get(f.id);
    const ownProjectIds = [...new Set(meta?.ownProjectIds ?? [])];
    const inheritedLinks = walkInherited(f.id, folderMap);
    const inheritedProjectIds = inheritedLinks.map((l) => l.projectId);
    const effectiveProjectIds = [
      ...new Set([...ownProjectIds, ...inheritedProjectIds]),
    ];
    const projectLinks: ProjectLink[] = [
      ...ownProjectIds.map((projectId) => ({ projectId, isInherited: false })),
      ...inheritedLinks,
    ];
    nodes.set(f.id, {
      id: f.id,
      name: f.name,
      parentId: f.parentId,
      ownProjectIds,
      inheritedProjectIds,
      effectiveProjectIds,
      projectLinks,
      subfolders: [],
      pages: pagesByFolder.get(f.id) ?? [],
    });
  }

  // Step 4: link children to parents; collect roots (parentId null or dangling).
  const roots: TreeFolder[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent) parent.subfolders.push(node);
    else roots.push(node);
  }

  return { roots, standalonePages };
}
