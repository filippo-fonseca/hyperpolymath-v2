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
