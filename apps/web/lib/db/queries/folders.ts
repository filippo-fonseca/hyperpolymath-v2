import { db } from "@/lib/db";
import { pageFolders } from "@/lib/db/schema";
import { and, asc, eq } from "drizzle-orm";

export interface FolderRow {
  id: string;
  projectId: string;
  name: string;
  orderIndex: number;
}

const FOLDER_COLS = {
  id: pageFolders.id,
  projectId: pageFolders.projectId,
  name: pageFolders.name,
  orderIndex: pageFolders.orderIndex,
} as const;

/** All wiki folders for a user, ordered for stable tree rendering. */
export async function getFoldersForUser(userId: string): Promise<FolderRow[]> {
  return db
    .select(FOLDER_COLS)
    .from(pageFolders)
    .where(eq(pageFolders.userId, userId))
    .orderBy(asc(pageFolders.orderIndex), asc(pageFolders.name));
}

/** Folders within a single project. */
export async function getFoldersForProject(
  userId: string,
  projectId: string
): Promise<FolderRow[]> {
  return db
    .select(FOLDER_COLS)
    .from(pageFolders)
    .where(and(eq(pageFolders.userId, userId), eq(pageFolders.projectId, projectId)))
    .orderBy(asc(pageFolders.orderIndex), asc(pageFolders.name));
}
