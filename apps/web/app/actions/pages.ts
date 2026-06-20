"use server";

import { db } from "@/lib/db";
import { type PageWithProjects, getPagesForUser } from "@/lib/db/queries/pages";
import { pages, pagesProjects, projects } from "@/lib/db/schema";
import { createClient } from "@/lib/supabase/server";
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
        await tx.insert(pagesProjects).values(
          validIds.map((projectId) => ({
            pageId: page.id,
            projectId,
            userId,
          }))
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
      parsed.data.pinned !== undefined;

    if (hasScalarUpdate) {
      const set: Record<string, unknown> = { updatedAt: sql`now()` };
      if (parsed.data.title !== undefined) set.title = parsed.data.title;
      if (parsed.data.content !== undefined) set.content = parsed.data.content;
      if (parsed.data.contentJson !== undefined) set.contentJson = parsed.data.contentJson;
      if (parsed.data.emoji !== undefined) set.emoji = parsed.data.emoji;
      if (parsed.data.pinned !== undefined) set.pinned = parsed.data.pinned;

      await tx
        .update(pages)
        .set(set)
        .where(and(eq(pages.id, parsed.data.id), eq(pages.userId, userId)));
    }

    if (parsed.data.projectIds !== undefined) {
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
