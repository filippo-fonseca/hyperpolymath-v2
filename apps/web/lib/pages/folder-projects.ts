/**
 * Client-safe folder/project types + the pure effective-project-set helpers.
 *
 * This module deliberately imports NOTHING from the DB layer so it can be
 * pulled into client components (e.g. ProjectPagesSection) without dragging the
 * node-only `postgres` driver into the browser bundle. The DB query module
 * (lib/db/queries/folders.ts) re-exports these so server callers keep a single
 * import site.
 */

/**
 * Project-independent folder shape. Phase 21 decoupled folders from projects:
 * a folder nests under another folder (parentId) and links to zero or more
 * projects via the folder_projects junction (see FolderProjectLink).
 */
export interface FolderRow {
  id: string;
  parentId: string | null;
  name: string;
  orderIndex: number;
}

/** A folder plus the project ids it directly links to (its OWN links, not inherited). */
export interface FolderWithProjects extends FolderRow {
  ownProjectIds: string[];
}

/** One row of the folder_projects M:N junction. */
export interface FolderProjectLink {
  folderId: string;
  projectId: string;
}

/**
 * Walk a folder's ancestor chain and union every ancestor's OWN project links.
 * Does NOT include the folder's own links (see getEffectiveProjectIds for that).
 *
 * Cycle-safe: a `visited` set guards against a corrupt parent chain (the DB
 * CHECK + app-layer cycle guard should make true cycles impossible, but a
 * defensive walk costs nothing and prevents an infinite loop).
 */
export function getInheritedProjectIds(
  folderId: string,
  folderMap: Map<string, FolderWithProjects>,
): string[] {
  const acc = new Set<string>();
  const visited = new Set<string>();
  let current = folderMap.get(folderId)?.parentId ?? null;

  while (current && !visited.has(current)) {
    visited.add(current);
    const ancestor = folderMap.get(current);
    if (!ancestor) break;
    for (const pid of ancestor.ownProjectIds) acc.add(pid);
    current = ancestor.parentId;
  }

  return [...acc];
}

/**
 * A folder's EFFECTIVE project set: its own links unioned with every ancestor's
 * links. This is the set a folder is "visible under" on a project page — a
 * subfolder inherits its parents' project memberships (locked decision: folder
 * placement cascades downward through the tree).
 */
export function getEffectiveProjectIds(
  folderId: string,
  folderMap: Map<string, FolderWithProjects>,
): string[] {
  const acc = new Set<string>(folderMap.get(folderId)?.ownProjectIds ?? []);
  for (const pid of getInheritedProjectIds(folderId, folderMap)) acc.add(pid);
  return [...acc];
}

/**
 * One project assignment as a render-ready pill: the project id, whether the
 * assignment is DIRECT (a link that lives on the element itself) or INHERITED
 * (a link that lives on an ancestor folder and cascades down), and, for an
 * inherited assignment, the name of the ancestor folder that actually owns the
 * link so the UI can show an "inherited from <folder>" affordance (Phase 23).
 *
 * This mirrors `ProjectLink` in lib/pages/tree.ts but resolves `sourceFolder`
 * to a human-readable NAME (tree.ts keeps it as a folder id for its internal
 * walk). Pills carry the name because that is what the UI renders.
 */
export interface ProjectPillLink {
  projectId: string;
  isInherited: boolean;
  /** Ancestor folder name that owns an inherited link (undefined when direct). */
  sourceFolderName?: string;
}

/**
 * Build the pill links for a PAGE from its direct project ids (its own
 * pages_projects rows) and the EFFECTIVE project set of the folder it sits in.
 *
 * Rules (Phase 23):
 *   - Every direct project id is a DIRECT pill.
 *   - Every project in the folder's effective set that is NOT already a direct
 *     link becomes an INHERITED pill, attributed to the folder the page lives in
 *     (`folderName`) since that is the nearest source the page inherits from.
 *   - Direct wins on conflict (a project linked both directly and via the folder
 *     renders once, as direct).
 *
 * Pure + client-safe: takes plain arrays, returns plain data, imports nothing.
 */
export function buildPageProjectPills(args: {
  directProjectIds: string[];
  folderName: string | null;
  folderEffectiveProjectIds: string[];
}): ProjectPillLink[] {
  const { directProjectIds, folderName, folderEffectiveProjectIds } = args;
  const direct = [...new Set(directProjectIds)];
  const directSet = new Set(direct);
  const pills: ProjectPillLink[] = direct.map((projectId) => ({
    projectId,
    isInherited: false,
  }));
  const seen = new Set(direct);
  for (const projectId of folderEffectiveProjectIds) {
    if (directSet.has(projectId) || seen.has(projectId)) continue;
    seen.add(projectId);
    pills.push({
      projectId,
      isInherited: true,
      sourceFolderName: folderName ?? undefined,
    });
  }
  return pills;
}
