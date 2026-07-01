"use server";

import { db } from "@/lib/db";
import { getFieldDefinitionsForUser } from "@/lib/db/queries/pages";
import { pageFieldDefinitions, pageFieldValues, pages } from "@/lib/db/schema";
import {
  type PageFieldDefinition,
  type PageFieldSelectOption,
  asSelectIds,
  coerceFieldValue,
} from "@/lib/pages/custom-fields";
import { createClient } from "@/lib/supabase/server";
import { and, eq, sql } from "drizzle-orm";
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

/** Auth-gated list of all the user's field definitions (add-property picker). */
export async function getFieldDefinitionsForCurrentUser(): Promise<PageFieldDefinition[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) throw new Error("Unauthorized");
  return getFieldDefinitionsForUser(data.claims.sub);
}

const CreateFieldDefinitionSchema = z.object({
  name: z.string().trim().min(1).max(100),
  type: FieldTypeSchema,
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

  const [{ maxOrder }] = await db
    .select({ maxOrder: sql<number>`coalesce(max(${pageFieldDefinitions.orderIndex}), -1)` })
    .from(pageFieldDefinitions)
    .where(eq(pageFieldDefinitions.userId, userId));

  const [row] = await db
    .insert(pageFieldDefinitions)
    .values({
      userId,
      name: parsed.data.name,
      type: parsed.data.type,
      options,
      allowMultiple,
      orderIndex: Number(maxOrder) + 1,
    })
    .returning({
      id: pageFieldDefinitions.id,
      name: pageFieldDefinitions.name,
      type: pageFieldDefinitions.type,
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

/** Rename a field or edit a select field's options/tags-mode. Type is immutable. */
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

/** Delete a definition; cascades its values, removing the field from all pages. */
export async function deleteFieldDefinition(id: string): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  if (!z.string().uuid().safeParse(id).success) return { success: false, error: "Invalid id" };
  await db
    .delete(pageFieldDefinitions)
    .where(and(eq(pageFieldDefinitions.id, id), eq(pageFieldDefinitions.userId, userId)));
  return { success: true, data: null };
}

const PageFieldRefSchema = z.object({
  pageId: z.string().uuid(),
  fieldDefinitionId: z.string().uuid(),
});

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

/** Attach an existing field definition to a page with an empty value. */
export async function attachFieldToPage(input: unknown): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  const parsed = PageFieldRefSchema.safeParse(input);
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
      })
      .onConflictDoNothing({
        target: [pageFieldValues.pageId, pageFieldValues.fieldDefinitionId],
      });
    return true;
  });

  return result
    ? { success: true, data: null }
    : { success: false, error: "Page or field not found" };
}

/** Remove a field from a page (keeps the definition for reuse elsewhere). */
export async function detachFieldFromPage(input: unknown): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };
  const parsed = PageFieldRefSchema.safeParse(input);
  if (!parsed.success)
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  await db.transaction(async (tx) => {
    await assertOwnedPageAndTouch(tx, userId, parsed.data.pageId);
    await tx
      .delete(pageFieldValues)
      .where(
        and(
          eq(pageFieldValues.pageId, parsed.data.pageId),
          eq(pageFieldValues.fieldDefinitionId, parsed.data.fieldDefinitionId),
          eq(pageFieldValues.userId, userId),
        ),
      );
  });

  return { success: true, data: null };
}

const SetPageFieldValueSchema = z.object({
  pageId: z.string().uuid(),
  fieldDefinitionId: z.string().uuid(),
  value: z.unknown(),
});

/**
 * Upsert a page's value for a field. The raw value is coerced to the field
 * type's stored form (single source of truth in lib/pages/custom-fields); for
 * select fields it is filtered to option ids that currently exist on the
 * definition, so deleting an option can never leave a dangling reference.
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
