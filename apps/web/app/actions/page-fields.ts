"use server";

import { db } from "@/lib/db";
import { getFieldDefinitionsForUser } from "@/lib/db/queries/pages";
import { pageFieldDefinitions, pageFieldValues, pageFolders, pages } from "@/lib/db/schema";
import {
  type PageFieldDefinition,
  type PageFieldSelectOption,
  asSelectIds,
  coerceFieldValue,
} from "@/lib/pages/custom-fields";
import { createClient } from "@/lib/supabase/server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

type ActionResult<T = unknown> = { success: true; data: T } | { success: false; error: string };

/** CLAUDE.md Critical Pattern 1: validate via getClaims(), never getSession(). */
async function getUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;
  return data.claims.sub;
}

const SelectOptionSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().trim().min(1).max(100),
  color: z.string().max(24).optional(),
});

const FieldTypeSchema = z.enum(["text", "number", "date", "select", "checkbox"]);

/** Auth-gated list of all the user's field definitions (wiki + folder). */
export async function getFieldDefinitionsForCurrentUser(): Promise<PageFieldDefinition[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) throw new Error("Unauthorized");
  return getFieldDefinitionsForUser(data.claims.sub);
}

const CreateFieldDefinitionSchema = z.object({
  name: z.string().trim().min(1).max(100),
  type: FieldTypeSchema,
  scope: z.enum(["wiki", "folder"]).default("wiki"),
  folderId: z.string().uuid().nullable().optional(),
  options: z.array(SelectOptionSchema).max(50).optional(),
  allowMultiple: z.boolean().optional(),
});

export async function createFieldDefinition(
  input: unknown,
): Promise<ActionResult<PageFieldDefinition>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  const parsed = CreateFieldDefinitionSchema.safeParse(input);
  if (!parsed.success)
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const isSelect = parsed.data.type === "select";
  const options: PageFieldSelectOption[] | null = isSelect ? (parsed.data.options ?? []) : null;
  const allowMultiple = isSelect ? (parsed.data.allowMultiple ?? false) : false;

  // Folder-scoped defs must target a top-level folder the user owns.
  let folderId: string | null = null;
  if (parsed.data.scope === "folder") {
    if (!parsed.data.folderId) return { success: false, error: "Folder is required" };
    const [folder] = await db
      .select({ id: pageFolders.id, parentId: pageFolders.parentId })
      .from(pageFolders)
      .where(and(eq(pageFolders.id, parsed.data.folderId), eq(pageFolders.userId, userId)));
    if (!folder) return { success: false, error: "Folder not found" };
    if (folder.parentId !== null)
      return { success: false, error: "Only top-level folders can define properties" };
    folderId = folder.id;
  }

  // Order among the same scope/folder set so wiki and each folder order independently.
  const [{ maxOrder }] = await db
    .select({ maxOrder: sql<number>`coalesce(max(${pageFieldDefinitions.orderIndex}), -1)` })
    .from(pageFieldDefinitions)
    .where(
      and(
        eq(pageFieldDefinitions.userId, userId),
        eq(pageFieldDefinitions.scope, parsed.data.scope),
        folderId ? eq(pageFieldDefinitions.folderId, folderId) : isNull(pageFieldDefinitions.folderId),
      ),
    );

  const [row] = await db
    .insert(pageFieldDefinitions)
    .values({
      userId,
      name: parsed.data.name,
      type: parsed.data.type,
      scope: parsed.data.scope,
      folderId,
      options,
      allowMultiple,
      orderIndex: Number(maxOrder) + 1,
    })
    .returning({
      id: pageFieldDefinitions.id,
      name: pageFieldDefinitions.name,
      type: pageFieldDefinitions.type,
      scope: pageFieldDefinitions.scope,
      folderId: pageFieldDefinitions.folderId,
      options: pageFieldDefinitions.options,
      allowMultiple: pageFieldDefinitions.allowMultiple,
      orderIndex: pageFieldDefinitions.orderIndex,
    });

  return {
    success: true,
    data: {
      id: row.id,
      name: row.name,
      type: row.type,
      scope: row.scope,
      folderId: row.folderId ?? null,
      options: row.options ?? null,
      allowMultiple: row.allowMultiple,
      orderIndex: row.orderIndex,
    },
  };
}

const UpdateFieldDefinitionSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(100).optional(),
  options: z.array(SelectOptionSchema).max(50).optional(),
  allowMultiple: z.boolean().optional(),
});

/** Rename a field or edit a select field's options/tags-mode. Type + scope are immutable. */
export async function updateFieldDefinition(input: unknown): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  const parsed = UpdateFieldDefinitionSchema.safeParse(input);
  if (!parsed.success)
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const set: Record<string, unknown> = { updatedAt: sql`now()` };
  if (parsed.data.name !== undefined) set.name = parsed.data.name;
  if (parsed.data.options !== undefined) set.options = parsed.data.options;
  if (parsed.data.allowMultiple !== undefined) set.allowMultiple = parsed.data.allowMultiple;

  await db
    .update(pageFieldDefinitions)
    .set(set)
    .where(and(eq(pageFieldDefinitions.id, parsed.data.id), eq(pageFieldDefinitions.userId, userId)));

  return { success: true, data: null };
}

/** Delete a definition; cascades its values, removing the field everywhere. */
export async function deleteFieldDefinition(id: string): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  if (!z.string().uuid().safeParse(id).success) return { success: false, error: "Invalid id" };
  await db
    .delete(pageFieldDefinitions)
    .where(and(eq(pageFieldDefinitions.id, id), eq(pageFieldDefinitions.userId, userId)));
  return { success: true, data: null };
}

const ReorderSchema = z.object({ ids: z.array(z.string().uuid()).max(100) });

/** Persist a new display order for a set of definitions (by array position). */
export async function reorderFieldDefinitions(input: unknown): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  const parsed = ReorderSchema.safeParse(input);
  if (!parsed.success)
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  await db.transaction(async (tx) => {
    for (let i = 0; i < parsed.data.ids.length; i++) {
      await tx
        .update(pageFieldDefinitions)
        .set({ orderIndex: i, updatedAt: sql`now()` })
        .where(
          and(
            eq(pageFieldDefinitions.id, parsed.data.ids[i]),
            eq(pageFieldDefinitions.userId, userId),
          ),
        );
    }
  });

  return { success: true, data: null };
}

/** Confirm the page belongs to the user and bump its updated_at (fires pages realtime). */
async function assertOwnedPageAndTouch(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: string,
  pageId: string,
): Promise<boolean> {
  const res = await tx
    .update(pages)
    .set({ updatedAt: sql`now()` })
    .where(and(eq(pages.id, pageId), eq(pages.userId, userId)))
    .returning({ id: pages.id });
  return res.length > 0;
}

const SetPageFieldValueSchema = z.object({
  pageId: z.string().uuid(),
  fieldDefinitionId: z.string().uuid(),
  value: z.unknown(),
});

/**
 * Upsert a page's value for a field. The raw value is coerced to the field
 * type's stored form; select ids are filtered to option ids that currently
 * exist on the definition. Preserves the row's hidden flag on conflict.
 */
export async function setPageFieldValue(input: unknown): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  const parsed = SetPageFieldValueSchema.safeParse(input);
  if (!parsed.success)
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const result = await db.transaction(async (tx) => {
    if (!(await assertOwnedPageAndTouch(tx, userId, parsed.data.pageId))) return false;
    const [def] = await tx
      .select({
        id: pageFieldDefinitions.id,
        type: pageFieldDefinitions.type,
        options: pageFieldDefinitions.options,
        allowMultiple: pageFieldDefinitions.allowMultiple,
      })
      .from(pageFieldDefinitions)
      .where(
        and(
          eq(pageFieldDefinitions.id, parsed.data.fieldDefinitionId),
          eq(pageFieldDefinitions.userId, userId),
        ),
      );
    if (!def) return false;

    let value = coerceFieldValue(def.type, def.allowMultiple, parsed.data.value);
    if (def.type === "select" && value !== null) {
      const validIds = new Set((def.options ?? []).map((o) => o.id));
      const filtered = asSelectIds(value).filter((id) => validIds.has(id));
      value = filtered.length === 0 ? null : filtered;
    }

    await tx
      .insert(pageFieldValues)
      .values({
        pageId: parsed.data.pageId,
        fieldDefinitionId: parsed.data.fieldDefinitionId,
        userId,
        value,
      })
      .onConflictDoUpdate({
        target: [pageFieldValues.pageId, pageFieldValues.fieldDefinitionId],
        set: { value, updatedAt: sql`now()` },
      });
    return true;
  });

  return result
    ? { success: true, data: null }
    : { success: false, error: "Page or field not found" };
}

const SetPageFieldHiddenSchema = z.object({
  pageId: z.string().uuid(),
  fieldDefinitionId: z.string().uuid(),
  hidden: z.boolean(),
});

/**
 * Toggle a property's per-page visibility. Upserts a value row carrying the
 * hidden flag (value is left untouched on conflict, so a hidden field keeps any
 * value it had). Bumps pages.updated_at so the pages realtime subscription syncs.
 */
export async function setPageFieldHidden(input: unknown): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  const parsed = SetPageFieldHiddenSchema.safeParse(input);
  if (!parsed.success)
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const result = await db.transaction(async (tx) => {
    if (!(await assertOwnedPageAndTouch(tx, userId, parsed.data.pageId))) return false;
    const [def] = await tx
      .select({ id: pageFieldDefinitions.id })
      .from(pageFieldDefinitions)
      .where(
        and(
          eq(pageFieldDefinitions.id, parsed.data.fieldDefinitionId),
          eq(pageFieldDefinitions.userId, userId),
        ),
      );
    if (!def) return false;

    await tx
      .insert(pageFieldValues)
      .values({
        pageId: parsed.data.pageId,
        fieldDefinitionId: parsed.data.fieldDefinitionId,
        userId,
        value: null,
        hidden: parsed.data.hidden,
      })
      .onConflictDoUpdate({
        target: [pageFieldValues.pageId, pageFieldValues.fieldDefinitionId],
        set: { hidden: parsed.data.hidden, updatedAt: sql`now()` },
      });
    return true;
  });

  return result
    ? { success: true, data: null }
    : { success: false, error: "Page or field not found" };
}
