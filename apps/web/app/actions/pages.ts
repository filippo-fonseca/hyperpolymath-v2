"use server";

import { db } from "@/lib/db";
import {
  type DailyPageRef,
  type PageWithProjects,
  getDailyPagesForUser,
  getPagesForUser,
} from "@/lib/db/queries/pages";
import { pageFolders, pages, pagesProjects, projects } from "@/lib/db/schema";
import { createClient } from "@/lib/supabase/server";
import { dailyPageTitle, isValidDailyDate } from "@/lib/pages/daily-page";
// pageFolders is imported for the createPage folder-ownership check below.
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

type ActionResult<T = unknown> = { success: true; data: T } | { success: false; error: string };

/**
 * CLAUDE.md Critical Pattern 1: validate the user via getClaims() — never
 * getSession() in server code.
 */
async function getUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;
  return data.claims.sub;
}

const CreatePageSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().max(500).default(""),
  content: z.string().max(200000).default(""),
  contentJson: z.unknown().optional(),
  emoji: z.string().nullable().optional(),
  projectIds: z.array(z.string().uuid()).max(20).default([]),
  // Folder placement is page-level now (locked decision 3): it writes onto the
  // pages row directly, independent of any project link. null/omitted = standalone.
  folderId: z.string().uuid().nullable().optional(),
});

export async function createPage(input: unknown): Promise<ActionResult<{ id: string }>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  const parsed = CreatePageSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };

  const result = await db.transaction(async (tx) => {
    // Only honor a folderId the user actually owns (the folder is no longer
    // project-scoped, so there is no per-project cross-check to apply).
    let folderId: string | null = null;
    if (parsed.data.folderId) {
      const [folder] = await tx
        .select({ id: pageFolders.id })
        .from(pageFolders)
        .where(
          and(
            eq(pageFolders.id, parsed.data.folderId),
            eq(pageFolders.userId, userId),
          ),
        );
      if (folder) folderId = folder.id;
    }

    const [page] = await tx
      .insert(pages)
      .values({
        ...(parsed.data.id ? { id: parsed.data.id } : {}),
        userId,
        title: parsed.data.title,
        content: parsed.data.content,
        ...(parsed.data.contentJson !== undefined
          ? { contentJson: parsed.data.contentJson }
          : {}),
        emoji: parsed.data.emoji ?? null,
        folderId,
      })
      .returning({ id: pages.id });

    if (parsed.data.projectIds.length > 0) {
      const owned = await tx
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.userId, userId), inArray(projects.id, parsed.data.projectIds)));
      const ownedIds = new Set(owned.map((p) => p.id));
      const validIds = parsed.data.projectIds.filter((pid) => ownedIds.has(pid));
      if (validIds.length > 0) {
        // Direct project links only; folder placement lives on the page row.
        await tx.insert(pagesProjects).values(
          validIds.map((projectId) => ({
            pageId: page.id,
            projectId,
            userId,
          })),
        );
      }
    }

    return page.id;
  });

  return { success: true, data: { id: result } };
}

const UpdatePageSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().max(500).optional(),
  content: z.string().max(200000).optional(),
  contentJson: z.unknown().optional(),
  emoji: z.string().nullable().optional(),
  pinned: z.boolean().optional(),
  // Issue #28 — Notion-style cover/banner image. coverImageUrl must be an http(s)
  // URL (or null to remove the banner); coverImageAttribution is the optional
  // Unsplash credit string. Both omitted = the cover is untouched on this save.
  coverImageUrl: z.string().url().max(2000).nullable().optional(),
  coverImageAttribution: z.string().max(300).nullable().optional(),
  projectIds: z.array(z.string().uuid()).max(20).optional(),
});

export async function updatePage(input: unknown): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  const parsed = UpdatePageSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };

  await db.transaction(async (tx) => {
    const hasScalarUpdate =
      parsed.data.title !== undefined ||
      parsed.data.content !== undefined ||
      parsed.data.contentJson !== undefined ||
      parsed.data.emoji !== undefined ||
      parsed.data.pinned !== undefined ||
      parsed.data.coverImageUrl !== undefined ||
      parsed.data.coverImageAttribution !== undefined;

    if (hasScalarUpdate) {
      const set: Record<string, unknown> = { updatedAt: sql`now()` };
      if (parsed.data.title !== undefined) set.title = parsed.data.title;
      if (parsed.data.content !== undefined) set.content = parsed.data.content;
      if (parsed.data.contentJson !== undefined) set.contentJson = parsed.data.contentJson;
      if (parsed.data.emoji !== undefined) set.emoji = parsed.data.emoji;
      if (parsed.data.pinned !== undefined) set.pinned = parsed.data.pinned;
      if (parsed.data.coverImageUrl !== undefined) set.coverImageUrl = parsed.data.coverImageUrl;
      if (parsed.data.coverImageAttribution !== undefined)
        set.coverImageAttribution = parsed.data.coverImageAttribution;

      await tx
        .update(pages)
        .set(set)
        .where(and(eq(pages.id, parsed.data.id), eq(pages.userId, userId)));
    }

    if (parsed.data.projectIds !== undefined) {
      // Folder placement is page-level now, so relinking projects no longer
      // touches folder placement — just replace the direct project links.
      await tx
        .delete(pagesProjects)
        .where(and(eq(pagesProjects.pageId, parsed.data.id), eq(pagesProjects.userId, userId)));
      if (parsed.data.projectIds.length > 0) {
        const owned = await tx
          .select({ id: projects.id })
          .from(projects)
          .where(and(eq(projects.userId, userId), inArray(projects.id, parsed.data.projectIds)));
        const ownedIds = new Set(owned.map((p) => p.id));
        const validIds = parsed.data.projectIds.filter((pid) => ownedIds.has(pid));
        if (validIds.length > 0) {
          await tx.insert(pagesProjects).values(
            validIds.map((projectId) => ({
              pageId: parsed.data.id,
              projectId,
              userId,
            }))
          );
        }
      }
    }
  });

  return { success: true, data: null };
}

const SetPageNoExportSchema = z.object({
  pageId: z.string().uuid(),
  noExport: z.boolean(),
});

/**
 * Flip pages.no_export for an owned page (Phase 29). When no_export is true the
 * page is excluded from the context snapshot, MCP export, and the knowledge
 * graph (loadPages skips it). Mirrors updatePage's auth + user-scoped WHERE.
 */
export async function setPageNoExport(input: unknown): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  const parsed = SetPageNoExportSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };

  await db
    .update(pages)
    .set({ noExport: parsed.data.noExport })
    .where(and(eq(pages.id, parsed.data.pageId), eq(pages.userId, userId)));

  return { success: true, data: null };
}

export async function deletePage(id: string): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  if (!z.string().uuid().safeParse(id).success) return { success: false, error: "Invalid id" };
  await db.delete(pages).where(and(eq(pages.id, id), eq(pages.userId, userId)));
  return { success: true, data: null };
}

/**
 * Auth-gated SELECT for the signed-in user's pages.
 * queryFn target for `useQuery({ queryKey: tableKey("pages", userId) })`.
 */
export async function getPagesForCurrentUser(): Promise<PageWithProjects[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) throw new Error("Unauthorized");
  return getPagesForUser(data.claims.sub);
}

/**
 * Auth-gated SELECT for the signed-in user's Daily Pages (Phase 30).
 * queryFn target for the Wiki-home calendar's marked-day query.
 */
export async function getDailyPagesForCurrentUser(): Promise<DailyPageRef[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) throw new Error("Unauthorized");
  return getDailyPagesForUser(data.claims.sub);
}

const OpenDailyPageSchema = z.object({
  date: z
    .string()
    .refine(isValidDailyDate, "Expected a yyyy-MM-dd calendar date"),
});

/**
 * Idempotently open (creating if needed) the user's Daily Page for `date`
 * (yyyy-MM-dd) and return its id (Phase 30, WIKI-DAILY-02).
 *
 * Exactly one Daily Page per user per day, race-safe: an INSERT ... ON CONFLICT
 * DO NOTHING against the partial unique index (user_id, daily_date) can never
 * create a duplicate even under concurrent opens. We SELECT first (the common
 * "day already opened" path avoids a write), then guard-INSERT, then SELECT
 * again so a concurrent insert that won the race is still returned.
 */
export async function openDailyPage(input: unknown): Promise<ActionResult<{ id: string }>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  const parsed = OpenDailyPageSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  const { date } = parsed.data;

  // Fast path: the day's page already exists.
  const existing = await db
    .select({ id: pages.id })
    .from(pages)
    .where(and(eq(pages.userId, userId), eq(pages.dailyDate, date)))
    .limit(1);
  if (existing[0]) return { success: true, data: { id: existing[0].id } };

  // Guarded insert. ON CONFLICT against the partial unique index makes the
  // write a no-op when a concurrent open already created the page.
  await db
    .insert(pages)
    .values({
      userId,
      title: dailyPageTitle(date),
      content: "",
      dailyDate: date,
    })
    .onConflictDoNothing({
      target: [pages.userId, pages.dailyDate],
      where: sql`daily_date IS NOT NULL`,
    });

  // Re-select: whether our insert or a racing one won, the row now exists.
  const row = await db
    .select({ id: pages.id })
    .from(pages)
    .where(and(eq(pages.userId, userId), eq(pages.dailyDate, date)))
    .limit(1);
  if (!row[0]) return { success: false, error: "Failed to open daily page" };
  return { success: true, data: { id: row[0].id } };
}
