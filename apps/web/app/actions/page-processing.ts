"use server";

import { db } from "@/lib/db";
import { jarvisPageProcessingRuns, pages } from "@/lib/db/schema";
import { createClient } from "@/lib/supabase/server";
import type { BlockHashes } from "@/lib/pages/block-hash";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

type ActionResult<T = unknown> = { success: true; data: T } | { success: false; error: string };

/** CLAUDE.md Critical Pattern 1: validate via getClaims(), never getSession(). */
async function getUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;
  return data.claims.sub;
}

/** A recorded "Process this page" run, shaped for the client. */
export interface ProcessingRun {
  id: string;
  pageId: string;
  turnId: string | null;
  scope: string;
  blockHashes: BlockHashes;
  processedBlockIds: string[];
  actions: unknown[];
  responseText: string | null;
  status: "done" | "error" | "skipped";
  createdAt: string;
}

function rowToRun(r: typeof jarvisPageProcessingRuns.$inferSelect): ProcessingRun {
  return {
    id: r.id,
    pageId: r.pageId,
    turnId: r.turnId,
    scope: r.scope,
    blockHashes: (r.blockHashes ?? {}) as BlockHashes,
    processedBlockIds: (r.processedBlockIds ?? []) as string[],
    actions: (r.actions ?? []) as unknown[],
    responseText: r.responseText,
    status: r.status as ProcessingRun["status"],
    createdAt: r.createdAt.toISOString(),
  };
}

/** True when `pageId` exists and is owned by `userId`. */
async function ownsPage(userId: string, pageId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: pages.id })
    .from(pages)
    .where(and(eq(pages.id, pageId), eq(pages.userId, userId)))
    .limit(1);
  return Boolean(row);
}

/**
 * The most recent processing run for a page, or null if it has never been
 * processed. The client diffs the live document against this run's blockHashes
 * to decide which blocks to re-process. 'skipped' runs (no model call) carry the
 * same snapshot forward, so they are valid diff baselines.
 */
export async function getLatestProcessingRun(
  pageId: string,
): Promise<ProcessingRun | null> {
  const userId = await getUserId();
  if (!userId) return null;
  if (!z.string().uuid().safeParse(pageId).success) return null;

  const [row] = await db
    .select()
    .from(jarvisPageProcessingRuns)
    .where(
      and(
        eq(jarvisPageProcessingRuns.userId, userId),
        eq(jarvisPageProcessingRuns.pageId, pageId),
      ),
    )
    .orderBy(desc(jarvisPageProcessingRuns.createdAt))
    .limit(1);

  return row ? rowToRun(row) : null;
}

/** All processing runs for a page, newest first (the history dropdown). */
export async function getProcessingRunsForPage(
  pageId: string,
): Promise<ProcessingRun[]> {
  const userId = await getUserId();
  if (!userId) return [];
  if (!z.string().uuid().safeParse(pageId).success) return [];

  const rows = await db
    .select()
    .from(jarvisPageProcessingRuns)
    .where(
      and(
        eq(jarvisPageProcessingRuns.userId, userId),
        eq(jarvisPageProcessingRuns.pageId, pageId),
      ),
    )
    .orderBy(desc(jarvisPageProcessingRuns.createdAt))
    .limit(50);

  return rows.map(rowToRun);
}

const RecordRunSchema = z.object({
  pageId: z.string().uuid(),
  turnId: z.string().uuid().nullable().optional(),
  scope: z.string().max(32).default("page"),
  blockHashes: z.record(z.string(), z.string()),
  processedBlockIds: z.array(z.string()).max(2000),
  actions: z.array(z.unknown()).max(500).default([]),
  responseText: z.string().max(20000).nullable().optional(),
  status: z.enum(["done", "error", "skipped"]),
});

/**
 * Record one "Process this page" run. The blockHashes snapshot becomes the
 * baseline the next run diffs against, so this MUST be called after every
 * Process click — including 'skipped' runs where nothing changed — to keep the
 * snapshot current. Re-derives userId server-side and verifies page ownership.
 */
export async function recordProcessingRun(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };

  const parsed = RecordRunSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid input" };
  const v = parsed.data;

  if (!(await ownsPage(userId, v.pageId))) {
    return { success: false, error: "Page not found" };
  }

  const [row] = await db
    .insert(jarvisPageProcessingRuns)
    .values({
      userId,
      pageId: v.pageId,
      turnId: v.turnId ?? null,
      scope: v.scope,
      blockHashes: v.blockHashes,
      processedBlockIds: v.processedBlockIds,
      actions: v.actions,
      responseText: v.responseText ?? null,
      status: v.status,
    })
    .returning({ id: jarvisPageProcessingRuns.id });

  return { success: true, data: { id: row.id } };
}
