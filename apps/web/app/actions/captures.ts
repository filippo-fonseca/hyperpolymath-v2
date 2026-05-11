"use server";

import { z } from "zod";
import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import {
  captures,
  capturesHashtags,
  capturesProjects,
  projects,
} from "@/lib/db/schema";
import { upsertHashtag } from "./hashtags";

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string };

async function getUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;
  return data.claims.sub;
}

const CreateCaptureSchema = z.object({
  content: z.string().trim().min(1).max(20000),
  hashtagNames: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
  projectIds: z.array(z.string().uuid()).max(20).default([]),
});

export async function createCapture(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  const parsed = CreateCaptureSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };

  const result = await db.transaction(async (tx) => {
    const [cap] = await tx
      .insert(captures)
      .values({ userId, content: parsed.data.content })
      .returning({ id: captures.id });

    // Upsert each hashtag (atomic, race-safe per Pitfall 9 — passing tx per Warning 10)
    if (parsed.data.hashtagNames.length > 0) {
      // Dedupe (case-insensitive)
      const seen = new Set<string>();
      const uniqueRaw = parsed.data.hashtagNames.filter((t) => {
        const k = t.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      const upserted: { id: string }[] = [];
      for (const raw of uniqueRaw) {
        // Warning 10 fix: pass tx so hashtag upsert is part of the same transaction.
        // If the captures_hashtags insert below fails, the hashtag inserts roll back too.
        const tag = await upsertHashtag(userId, raw, tx);
        upserted.push({ id: tag.id });
      }
      if (upserted.length > 0) {
        await tx.insert(capturesHashtags).values(
          upserted.map((t) => ({
            captureId: cap.id,
            hashtagId: t.id,
            userId,
          })),
        );
      }
    }

    // Link projects (verify ownership)
    if (parsed.data.projectIds.length > 0) {
      const owned = await tx
        .select({ id: projects.id })
        .from(projects)
        .where(
          and(
            eq(projects.userId, userId),
            inArray(projects.id, parsed.data.projectIds),
          ),
        );
      const ownedIds = new Set(owned.map((p) => p.id));
      const validIds = parsed.data.projectIds.filter((pid) =>
        ownedIds.has(pid),
      );
      if (validIds.length > 0) {
        await tx.insert(capturesProjects).values(
          validIds.map((projectId) => ({
            captureId: cap.id,
            projectId,
            userId,
          })),
        );
      }
    }

    return cap.id;
  });

  revalidatePath("/captures");
  revalidatePath("/projects/[projectId]", "page");
  return { success: true, data: { id: result } };
}

const UpdateCaptureSchema = z.object({
  id: z.string().uuid(),
  content: z.string().trim().min(1).max(20000).optional(),
  hashtagNames: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
  projectIds: z.array(z.string().uuid()).max(20).optional(),
});

export async function updateCapture(
  input: unknown,
): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  const parsed = UpdateCaptureSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };

  await db.transaction(async (tx) => {
    if (parsed.data.content !== undefined) {
      await tx
        .update(captures)
        .set({ content: parsed.data.content, updatedAt: sql`now()` })
        .where(
          and(
            eq(captures.id, parsed.data.id),
            eq(captures.userId, userId),
          ),
        );
    }

    if (parsed.data.hashtagNames !== undefined) {
      await tx
        .delete(capturesHashtags)
        .where(
          and(
            eq(capturesHashtags.captureId, parsed.data.id),
            eq(capturesHashtags.userId, userId),
          ),
        );
      const seen = new Set<string>();
      const uniqueRaw = parsed.data.hashtagNames.filter((t) => {
        const k = t.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      for (const raw of uniqueRaw) {
        // Warning 10 fix: pass tx (atomic with surrounding deletes/inserts)
        const tag = await upsertHashtag(userId, raw, tx);
        await tx.insert(capturesHashtags).values({
          captureId: parsed.data.id,
          hashtagId: tag.id,
          userId,
        });
      }
    }

    if (parsed.data.projectIds !== undefined) {
      await tx
        .delete(capturesProjects)
        .where(
          and(
            eq(capturesProjects.captureId, parsed.data.id),
            eq(capturesProjects.userId, userId),
          ),
        );
      if (parsed.data.projectIds.length > 0) {
        const owned = await tx
          .select({ id: projects.id })
          .from(projects)
          .where(
            and(
              eq(projects.userId, userId),
              inArray(projects.id, parsed.data.projectIds),
            ),
          );
        const ownedIds = new Set(owned.map((p) => p.id));
        const validIds = parsed.data.projectIds.filter((pid) =>
          ownedIds.has(pid),
        );
        if (validIds.length > 0) {
          await tx.insert(capturesProjects).values(
            validIds.map((projectId) => ({
              captureId: parsed.data.id,
              projectId,
              userId,
            })),
          );
        }
      }
    }
  });

  revalidatePath("/captures");
  revalidatePath("/projects/[projectId]", "page");
  return { success: true, data: null };
}

export async function deleteCapture(
  id: string,
): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  if (!z.string().uuid().safeParse(id).success)
    return { success: false, error: "Invalid id" };
  await db
    .delete(captures)
    .where(and(eq(captures.id, id), eq(captures.userId, userId)));
  revalidatePath("/captures");
  revalidatePath("/projects/[projectId]", "page");
  return { success: true, data: null };
}

/**
 * CAPT-06: full-text search via tsvector @@ to_tsquery.
 * Splits user query on whitespace, joins with & (AND match).
 * Returns top 50 by ts_rank DESC.
 */
const SearchSchema = z.object({
  query: z.string().trim().min(1).max(200),
  hashtagId: z.string().uuid().optional(),
});

export async function searchCaptures(
  input: unknown,
): Promise<ActionResult<string[]>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  const parsed = SearchSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };

  // Sanitize query: split on whitespace, filter empties, escape non-word chars, join with &
  const tokens = parsed.data.query
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}_]+/gu, ""))
    .filter((t) => t.length > 0)
    .map((t) => `${t}:*`); // prefix match
  if (tokens.length === 0) return { success: true, data: [] };
  const tsQuery = tokens.join(" & ");

  // Optional: filter by linked hashtag ID via subquery
  if (parsed.data.hashtagId) {
    const rows = await db
      .select({ id: captures.id })
      .from(captures)
      .innerJoin(
        capturesHashtags,
        and(
          eq(capturesHashtags.captureId, captures.id),
          eq(capturesHashtags.hashtagId, parsed.data.hashtagId),
          eq(capturesHashtags.userId, userId),
        ),
      )
      .where(
        and(
          eq(captures.userId, userId),
          sql`${captures.contentSearch} @@ to_tsquery('english', ${tsQuery})`,
        ),
      )
      .orderBy(
        sql`ts_rank(${captures.contentSearch}, to_tsquery('english', ${tsQuery})) DESC`,
      )
      .limit(50);
    return { success: true, data: rows.map((r) => r.id) };
  }

  const rows = await db
    .select({ id: captures.id })
    .from(captures)
    .where(
      and(
        eq(captures.userId, userId),
        sql`${captures.contentSearch} @@ to_tsquery('english', ${tsQuery})`,
      ),
    )
    .orderBy(
      sql`ts_rank(${captures.contentSearch}, to_tsquery('english', ${tsQuery})) DESC`,
    )
    .limit(50);
  return { success: true, data: rows.map((r) => r.id) };
}
