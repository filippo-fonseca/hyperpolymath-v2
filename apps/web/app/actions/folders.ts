"use server";

import { db } from "@/lib/db";
import { type FolderRow, getFoldersForUser } from "@/lib/db/queries/folders";
import { type SidebarArea, getSidebarTree } from "@/lib/db/queries/sidebar";
import { pageFolders, pagesProjects, projects } from "@/lib/db/schema";
import { createClient } from "@/lib/supabase/server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

type ActionResult<T = unknown> = { success: true; data: T } | { success: false; error: string };

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

const CreateFolderSchema = z.object({
  id: z.string().uuid().optional(),
  projectId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
});

export async function createFolder(input: unknown): Promise<ActionResult<{ id: string }>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  const parsed = CreateFolderSchema.safeParse(input);
  if (!parsed.success)
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  if (!(await ownsProject(userId, parsed.data.projectId)))
    return { success: false, error: "Project not found" };

  const [folder] = await db
    .insert(pageFolders)
    .values({
      ...(parsed.data.id ? { id: parsed.data.id } : {}),
      userId,
      projectId: parsed.data.projectId,
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
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  await db
    .update(pageFolders)
    .set({ name: parsed.data.name, updatedAt: sql`now()` })
    .where(and(eq(pageFolders.id, parsed.data.id), eq(pageFolders.userId, userId)));
  return { success: true, data: null };
}

export async function deleteFolder(id: string): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  if (!z.string().uuid().safeParse(id).success) return { success: false, error: "Invalid id" };
  // ON DELETE SET NULL reparents the folder's pages to loose under the project.
  await db.delete(pageFolders).where(and(eq(pageFolders.id, id), eq(pageFolders.userId, userId)));
  return { success: true, data: null };
}

const SetPageFolderSchema = z.object({
  pageId: z.string().uuid(),
  projectId: z.string().uuid(),
  folderId: z.string().uuid().nullable(),
});

/**
 * Move a page into (or out of) a folder for one of its project links. The
 * folder must belong to that same project; null clears the placement (loose).
 */
export async function setPageFolder(input: unknown): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  const parsed = SetPageFolderSchema.safeParse(input);
  if (!parsed.success)
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  if (parsed.data.folderId !== null) {
    const [folder] = await db
      .select({ projectId: pageFolders.projectId })
      .from(pageFolders)
      .where(and(eq(pageFolders.id, parsed.data.folderId), eq(pageFolders.userId, userId)))
      .limit(1);
    if (!folder) return { success: false, error: "Folder not found" };
    if (folder.projectId !== parsed.data.projectId)
      return { success: false, error: "Folder belongs to a different project" };
  }

  await db
    .update(pagesProjects)
    .set({ folderId: parsed.data.folderId })
    .where(
      and(
        eq(pagesProjects.pageId, parsed.data.pageId),
        eq(pagesProjects.projectId, parsed.data.projectId),
        eq(pagesProjects.userId, userId)
      )
    );
  return { success: true, data: null };
}

/** Client-callable: all folders for the signed-in user (Pages-home tree). */
export async function getFoldersForCurrentUser(): Promise<FolderRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) throw new Error("Unauthorized");
  return getFoldersForUser(data.claims.sub);
}

/** Client-callable: areas + projects (incl. archived) for the Pages-home tree. */
export async function getSidebarTreeForCurrentUser(): Promise<SidebarArea[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) throw new Error("Unauthorized");
  return getSidebarTree(data.claims.sub, true);
}
