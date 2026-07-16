"use server";

import { db } from "@/lib/db";
import { pageFolders, pages } from "@/lib/db/schema";
import { initialKeysFor, keyBetween } from "@/lib/pages/position";
import { createClient } from "@/lib/supabase/server";
import { and, asc, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { z } from "zod";

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string };

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type ItemKind = "page" | "folder";
type SiblingRow = { id: string; name: string; positionKey: string | null };

async function getUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;
  return data.claims.sub;
}

async function ownsFolder(
  tx: Tx,
  userId: string,
  folderId: string,
): Promise<boolean> {
  const [row] = await tx
    .select({ id: pageFolders.id })
    .from(pageFolders)
    .where(and(eq(pageFolders.id, folderId), eq(pageFolders.userId, userId)))
    .limit(1);
  return Boolean(row);
}

function pageParentWhere(userId: string, parentId: string | null) {
  return and(
    eq(pages.userId, userId),
    parentId === null ? isNull(pages.folderId) : eq(pages.folderId, parentId),
  );
}

function folderParentWhere(userId: string, parentId: string | null) {
  return and(
    eq(pageFolders.userId, userId),
    parentId === null
      ? isNull(pageFolders.parentId)
      : eq(pageFolders.parentId, parentId),
  );
}

async function getSiblings(
  tx: Tx,
  kind: ItemKind,
  userId: string,
  parentId: string | null,
  excludeIds: string[] = [],
): Promise<SiblingRow[]> {
  if (kind === "page") {
    return tx
      .select({
        id: pages.id,
        name: pages.title,
        positionKey: pages.positionKey,
      })
      .from(pages)
      .where(
        excludeIds.length > 0
          ? and(pageParentWhere(userId, parentId), notInArray(pages.id, excludeIds))
          : pageParentWhere(userId, parentId),
      )
      .orderBy(sql`${pages.positionKey} ASC NULLS LAST`, asc(pages.title), asc(pages.id));
  }

  return tx
    .select({
      id: pageFolders.id,
      name: pageFolders.name,
      positionKey: pageFolders.positionKey,
    })
    .from(pageFolders)
    .where(
      excludeIds.length > 0
        ? and(folderParentWhere(userId, parentId), notInArray(pageFolders.id, excludeIds))
        : folderParentWhere(userId, parentId),
    )
    .orderBy(
      sql`${pageFolders.positionKey} ASC NULLS LAST`,
      asc(pageFolders.name),
      asc(pageFolders.id),
    );
}

async function seedMissingSiblingKeys(
  tx: Tx,
  kind: ItemKind,
  userId: string,
  parentId: string | null,
  excludeIds: string[] = [],
): Promise<SiblingRow[]> {
  const rows = await getSiblings(tx, kind, userId, parentId, excludeIds);
  const missing = rows.filter((row) => row.positionKey === null);
  if (missing.length === 0) return rows;

  let lastKey = rows.findLast((row) => row.positionKey !== null)?.positionKey ?? null;
  const newKeys =
    lastKey === null
      ? initialKeysFor(missing.length)
      : missing.map(() => {
          lastKey = keyBetween(lastKey, null);
          return lastKey;
        });

  for (let i = 0; i < missing.length; i++) {
    const row = missing[i];
    const positionKey = newKeys[i];
    if (kind === "page") {
      await tx
        .update(pages)
        .set({ positionKey, updatedAt: sql`now()` })
        .where(and(eq(pages.id, row.id), eq(pages.userId, userId)));
    } else {
      await tx
        .update(pageFolders)
        .set({ positionKey, updatedAt: sql`now()` })
        .where(and(eq(pageFolders.id, row.id), eq(pageFolders.userId, userId)));
    }
    row.positionKey = positionKey;
  }

  return rows;
}

async function getItemInParent(
  tx: Tx,
  kind: ItemKind,
  userId: string,
  id: string,
  parentId: string | null,
): Promise<SiblingRow | null> {
  if (kind === "page") {
    const [row] = await tx
      .select({ id: pages.id, name: pages.title, positionKey: pages.positionKey })
      .from(pages)
      .where(and(eq(pages.id, id), pageParentWhere(userId, parentId)))
      .limit(1);
    return row ?? null;
  }

  const [row] = await tx
    .select({
      id: pageFolders.id,
      name: pageFolders.name,
      positionKey: pageFolders.positionKey,
    })
    .from(pageFolders)
    .where(and(eq(pageFolders.id, id), folderParentWhere(userId, parentId)))
    .limit(1);
  return row ?? null;
}

const ReorderItemSchema = z
  .object({
    kind: z.enum(["page", "folder"]),
    id: z.string().uuid(),
    afterId: z.string().uuid().nullable().optional(),
    beforeId: z.string().uuid().nullable().optional(),
    parentId: z.string().uuid().nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.afterId && value.afterId === value.id) {
      ctx.addIssue({
        code: "custom",
        path: ["afterId"],
        message: "afterId cannot be the reordered item",
      });
    }
    if (value.beforeId && value.beforeId === value.id) {
      ctx.addIssue({
        code: "custom",
        path: ["beforeId"],
        message: "beforeId cannot be the reordered item",
      });
    }
    if (value.afterId && value.beforeId && value.afterId === value.beforeId) {
      ctx.addIssue({
        code: "custom",
        path: ["beforeId"],
        message: "afterId and beforeId must be different",
      });
    }
  });

export async function reorderItem(input: unknown): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };

  const parsed = ReorderItemSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const { kind, id, parentId } = parsed.data;
  const afterId = parsed.data.afterId ?? null;
  const beforeId = parsed.data.beforeId ?? null;

  return db.transaction(async (tx) => {
    if (parentId !== null && !(await ownsFolder(tx, userId, parentId))) {
      return { success: false, error: "Folder not found" };
    }

    const target = await getItemInParent(tx, kind, userId, id, parentId);
    if (!target) {
      return {
        success: false,
        error: kind === "page" ? "Page not found" : "Folder not found",
      };
    }

    if (afterId && !(await getItemInParent(tx, kind, userId, afterId, parentId))) {
      return { success: false, error: "Previous item not found" };
    }
    if (beforeId && !(await getItemInParent(tx, kind, userId, beforeId, parentId))) {
      return { success: false, error: "Next item not found" };
    }

    const siblings = await seedMissingSiblingKeys(tx, kind, userId, parentId);
    const byId = new Map(siblings.map((row) => [row.id, row]));
    const lowerKey = afterId ? byId.get(afterId)?.positionKey ?? null : null;
    const upperKey = beforeId ? byId.get(beforeId)?.positionKey ?? null : null;

    if (afterId && lowerKey === null) {
      return { success: false, error: "Previous item has no position key" };
    }
    if (beforeId && upperKey === null) {
      return { success: false, error: "Next item has no position key" };
    }
    if (lowerKey !== null && upperKey !== null && lowerKey >= upperKey) {
      return { success: false, error: "Invalid neighbor order" };
    }

    const positionKey = keyBetween(lowerKey, upperKey);
    if (kind === "page") {
      await tx
        .update(pages)
        .set({ positionKey, updatedAt: sql`now()` })
        .where(and(eq(pages.id, id), eq(pages.userId, userId)));
    } else {
      await tx
        .update(pageFolders)
        .set({ positionKey, updatedAt: sql`now()` })
        .where(and(eq(pageFolders.id, id), eq(pageFolders.userId, userId)));
    }

    return { success: true, data: null };
  });
}

const MovePagesBulkSchema = z.object({
  pageIds: z.array(z.string().uuid()).min(1).max(200),
  folderId: z.string().uuid().nullable(),
});

export async function movePagesBulk(input: unknown): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };

  const parsed = MovePagesBulkSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const pageIds = [...new Set(parsed.data.pageIds)];
  const { folderId } = parsed.data;

  return db.transaction(async (tx) => {
    if (folderId !== null && !(await ownsFolder(tx, userId, folderId))) {
      return { success: false, error: "Folder not found" };
    }

    const ownedPages = await tx
      .select({ id: pages.id })
      .from(pages)
      .where(and(eq(pages.userId, userId), inArray(pages.id, pageIds)));
    if (ownedPages.length !== pageIds.length) {
      return { success: false, error: "One or more pages not found" };
    }

    const targetSiblings = await seedMissingSiblingKeys(
      tx,
      "page",
      userId,
      folderId,
      pageIds,
    );
    let lastKey =
      targetSiblings.findLast((row) => row.positionKey !== null)?.positionKey ?? null;

    for (const pageId of pageIds) {
      lastKey = keyBetween(lastKey, null);
      await tx
        .update(pages)
        .set({ folderId, positionKey: lastKey, updatedAt: sql`now()` })
        .where(and(eq(pages.id, pageId), eq(pages.userId, userId)));
    }

    return { success: true, data: null };
  });
}
