"use server";

import { db } from "@/lib/db";
import {
  type FolderProjectLink,
  type FolderRow,
  getFolderProjects,
  getFoldersForUser,
} from "@/lib/db/queries/folders";
import { type SidebarArea, getSidebarTree } from "@/lib/db/queries/sidebar";
import {
  folderProjects,
  pageFolders,
  pages,
  projects,
} from "@/lib/db/schema";
import { createClient } from "@/lib/supabase/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string };

async function getUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;
  return data.claims.sub;
}

async function ownsProject(userId: string, projectId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);
  return Boolean(row);
}

async function ownsFolder(userId: string, folderId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: pageFolders.id })
    .from(pageFolders)
    .where(and(eq(pageFolders.id, folderId), eq(pageFolders.userId, userId)))
    .limit(1);
  return Boolean(row);
}

const CreateFolderSchema = z.object({
  id: z.string().uuid().optional(),
  // Folders are project-independent now (WIKI-MODEL-02). A folder may be created
  // nested under another folder via parentId; null/omitted creates a root folder.
  parentId: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1).max(120),
});

export async function createFolder(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  const parsed = CreateFolderSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };

  // If nesting, the parent must belong to the same user.
  if (parsed.data.parentId) {
    if (!(await ownsFolder(userId, parsed.data.parentId)))
      return { success: false, error: "Parent folder not found" };
  }

  const [folder] = await db
    .insert(pageFolders)
    .values({
      ...(parsed.data.id ? { id: parsed.data.id } : {}),
      userId,
      parentId: parsed.data.parentId ?? null,
      name: parsed.data.name,
    })
    .returning({ id: pageFolders.id });

  return { success: true, data: { id: folder.id } };
}

const RenameFolderSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
});

export async function renameFolder(input: unknown): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  const parsed = RenameFolderSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };

  await db
    .update(pageFolders)
    .set({ name: parsed.data.name, updatedAt: sql`now()` })
    .where(and(eq(pageFolders.id, parsed.data.id), eq(pageFolders.userId, userId)));
  return { success: true, data: null };
}

export async function deleteFolder(id: string): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  if (!z.string().uuid().safeParse(id).success)
    return { success: false, error: "Invalid id" };
  // page_folders.parent_id ON DELETE CASCADE removes the subtree; pages in the
  // deleted folders are reparented to standalone by pages.folder_id ON DELETE SET NULL.
  await db
    .delete(pageFolders)
    .where(and(eq(pageFolders.id, id), eq(pageFolders.userId, userId)));
  return { success: true, data: null };
}

const SetParentFolderSchema = z.object({
  folderId: z.string().uuid(),
  parentId: z.string().uuid().nullable(),
});

/**
 * Reparent a folder (or make it a root with parentId = null). App-layer half of
 * cycle prevention (locked decision 5): rejects making a folder its own parent
 * or a descendant of itself by walking parentId's ancestor chain. The DB CHECK
 * (id <> parent_id) covers the trivial case; this walk covers the A->B->A case
 * and prevents the DoS in RESEARCH Pitfall 1.
 */
export async function setParentFolder(
  input: unknown,
): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  const parsed = SetParentFolderSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  const { folderId, parentId } = parsed.data;

  if (!(await ownsFolder(userId, folderId)))
    return { success: false, error: "Folder not found" };

  if (parentId !== null) {
    if (parentId === folderId)
      return { success: false, error: "A folder cannot be its own parent" };
    if (!(await ownsFolder(userId, parentId)))
      return { success: false, error: "Parent folder not found" };

    // Walk parentId's ancestor chain; if folderId appears, the move would make
    // folderId an ancestor of itself (a cycle). Reject before the update.
    const folders = await getFoldersForUser(userId);
    const parentOf = new Map(folders.map((f) => [f.id, f.parentId]));
    const visited = new Set<string>();
    let cursor: string | null = parentId;
    while (cursor && !visited.has(cursor)) {
      if (cursor === folderId)
        return {
          success: false,
          error: "Cannot move a folder into one of its own descendants",
        };
      visited.add(cursor);
      cursor = parentOf.get(cursor) ?? null;
    }
  }

  await db
    .update(pageFolders)
    .set({ parentId, updatedAt: sql`now()` })
    .where(and(eq(pageFolders.id, folderId), eq(pageFolders.userId, userId)));
  return { success: true, data: null };
}

const SetFolderProjectsSchema = z.object({
  folderId: z.string().uuid(),
  projectIds: z.array(z.string().uuid()),
});

/**
 * Replace a folder's folder_projects link set (the M:N folder->project links —
 * WIKI-MODEL-03). Owner-checks the folder and every project, deletes the
 * folder's existing links, then inserts the new set with user_id from getClaims
 * (never from the request body — STRIDE T-21-05).
 */
export async function setFolderProjects(
  input: unknown,
): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  const parsed = SetFolderProjectsSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  const { folderId, projectIds } = parsed.data;

  if (!(await ownsFolder(userId, folderId)))
    return { success: false, error: "Folder not found" };

  const uniqueProjectIds = [...new Set(projectIds)];

  // Every target project must belong to the user.
  if (uniqueProjectIds.length > 0) {
    const owned = await db
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.userId, userId),
          inArray(projects.id, uniqueProjectIds),
        ),
      );
    if (owned.length !== uniqueProjectIds.length)
      return { success: false, error: "One or more projects not found" };
  }

  await db
    .delete(folderProjects)
    .where(
      and(
        eq(folderProjects.folderId, folderId),
        eq(folderProjects.userId, userId),
      ),
    );

  if (uniqueProjectIds.length > 0) {
    await db.insert(folderProjects).values(
      uniqueProjectIds.map((projectId) => ({
        folderId,
        projectId,
        userId,
      })),
    );
  }

  return { success: true, data: null };
}

const SetPageFolderSchema = z.object({
  pageId: z.string().uuid(),
  folderId: z.string().uuid().nullable(),
});

/**
 * Place a page in a folder (or clear it with folderId = null). Folder placement
 * is page-level now (locked decision 3) — it writes pages.folder_id directly.
 * No project-membership cross-check: the folder is no longer project-scoped
 * (RESEARCH Pitfall 4), so we only verify the user owns both the page and the
 * target folder.
 */
export async function setPageFolder(input: unknown): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  const parsed = SetPageFolderSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };

  if (parsed.data.folderId !== null) {
    if (!(await ownsFolder(userId, parsed.data.folderId)))
      return { success: false, error: "Folder not found" };
  }

  await db
    .update(pages)
    .set({ folderId: parsed.data.folderId, updatedAt: sql`now()` })
    .where(and(eq(pages.id, parsed.data.pageId), eq(pages.userId, userId)));
  return { success: true, data: null };
}

/** Client-callable: all folders for the signed-in user (Pages-home tree). */
export async function getFoldersForCurrentUser(): Promise<FolderRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) throw new Error("Unauthorized");
  return getFoldersForUser(data.claims.sub);
}

/** Client-callable: all folder->project links for the signed-in user. */
export async function getFolderProjectsForCurrentUser(): Promise<
  FolderProjectLink[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) throw new Error("Unauthorized");
  return getFolderProjects(data.claims.sub);
}

/** Client-callable: areas + projects (incl. archived) for the Pages-home tree. */
export async function getSidebarTreeForCurrentUser(): Promise<SidebarArea[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) throw new Error("Unauthorized");
  return getSidebarTree(data.claims.sub, true);
}
