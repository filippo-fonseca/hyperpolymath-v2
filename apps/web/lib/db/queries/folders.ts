import { db } from "@/lib/db";
import { folderProjects, pageFolders } from "@/lib/db/schema";
import {
  getEffectiveProjectIds,
  type FolderProjectLink,
  type FolderRow,
  type FolderWithProjects,
} from "@/lib/pages/folder-projects";
import { asc, eq, sql } from "drizzle-orm";

// Re-export the client-safe types + pure helpers so server callers keep a single
// import site (the runtime helpers live in lib/pages/folder-projects.ts so they
// can be used in client components without pulling in the DB driver).
export {
  getEffectiveProjectIds,
  getInheritedProjectIds,
  type FolderProjectLink,
  type FolderRow,
  type FolderWithProjects,
} from "@/lib/pages/folder-projects";

const FOLDER_COLS = {
  id: pageFolders.id,
  parentId: pageFolders.parentId,
  name: pageFolders.name,
  orderIndex: pageFolders.orderIndex,
  positionKey: pageFolders.positionKey,
} as const;

/** All wiki folders for a user, ordered for stable tree rendering. */
export async function getFoldersForUser(userId: string): Promise<FolderRow[]> {
  return db
    .select(FOLDER_COLS)
    .from(pageFolders)
    .where(eq(pageFolders.userId, userId))
    .orderBy(sql`${pageFolders.positionKey} ASC NULLS LAST`, asc(pageFolders.name));
}

/** All folder->project links for a user (the M:N junction rows). */
export async function getFolderProjects(
  userId: string,
): Promise<FolderProjectLink[]> {
  return db
    .select({
      folderId: folderProjects.folderId,
      projectId: folderProjects.projectId,
    })
    .from(folderProjects)
    .where(eq(folderProjects.userId, userId));
}

/**
 * Folders for a user, each carrying its OWN direct project links. Built with a
 * single folders read + a single junction read, then joined in TS (the link
 * count per user is small, so this is cheaper than a SQL GROUP BY round-trip).
 */
export async function getFoldersWithProjects(
  userId: string,
): Promise<FolderWithProjects[]> {
  const [folders, links] = await Promise.all([
    getFoldersForUser(userId),
    getFolderProjects(userId),
  ]);

  const ownByFolder = new Map<string, string[]>();
  for (const link of links) {
    const list = ownByFolder.get(link.folderId);
    if (list) list.push(link.projectId);
    else ownByFolder.set(link.folderId, [link.projectId]);
  }

  return folders.map((f) => ({
    ...f,
    ownProjectIds: ownByFolder.get(f.id) ?? [],
  }));
}

/**
 * Folders that are effectively linked to a single project — i.e. the folder
 * itself links the project OR any ancestor does (inheritance). Used by the
 * project page to list the folders shown under that project.
 *
 * Implemented in TS over the full folder+link set (small per user). The
 * equivalent pure-SQL form is a recursive walk:
 *
 *   WITH RECURSIVE chain AS (
 *     SELECT f.id, f.parent_id
 *       FROM page_folders f
 *       JOIN folder_projects fp ON fp.folder_id = f.id
 *      WHERE fp.project_id = $1 AND f.user_id = $2
 *     UNION
 *     SELECT child.id, child.parent_id
 *       FROM page_folders child
 *       JOIN chain ON child.parent_id = chain.id
 *      WHERE child.user_id = $2
 *   )
 *   SELECT DISTINCT id FROM chain;
 *
 * The TS form is kept for readability and because effective-set logic is shared
 * with the tree builder (getEffectiveProjectIds).
 */
export async function getFoldersByEffectiveProject(
  userId: string,
  projectId: string,
): Promise<FolderRow[]> {
  const folders = await getFoldersWithProjects(userId);
  const folderMap = new Map(folders.map((f) => [f.id, f]));

  return folders
    .filter((f) => getEffectiveProjectIds(f.id, folderMap).includes(projectId))
    .map(({ id, parentId, name, orderIndex, positionKey }) => ({
      id,
      parentId,
      name,
      orderIndex,
      positionKey,
    }));
}
