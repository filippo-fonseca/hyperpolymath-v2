"use server";

/**
 * nutrition.ts — Server Actions for the nutrition feature.
 *
 * Thin wrappers that:
 *   1. Authenticate via getClaims() (CLAUDE.md Critical Pattern 1 — NEVER getSession())
 *   2. Validate input via Zod schemas
 *   3. Delegate to the nutrition-service layer
 *
 * No revalidatePath calls — Realtime + TanStack Query invalidation handles
 * cache updates (CLAUDE.md Critical Pattern 3 + Phase 17 RESEARCH D-14).
 *
 * D-14: The service layer is the JARVIS-ready surface. These actions are the
 * thin auth+validation shell around it.
 */

import { z } from "zod";
import { subDays, format } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import {
  logFood,
  deleteLog,
  updateLog,
  logMeal,
  upsertFood,
  createMeal,
  upsertNutritionTargets,
  copyDayLogs,
} from "@/lib/nutrition/nutrition-service";

// ---------------------------------------------------------------------------
// Auth helper — matches the pattern in apps/web/app/actions/training.ts
// ---------------------------------------------------------------------------

async function getUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;
  return data.claims.sub;
}

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string };

// ---------------------------------------------------------------------------
// Shared sub-schemas
// ---------------------------------------------------------------------------

const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date (YYYY-MM-DD)");
const UuidSchema = z.string().uuid();
const MealSlotSchema = z.enum(["breakfast", "lunch", "dinner", "snacks"]);

// ---------------------------------------------------------------------------
// logFoodAction — log a food item with snapshotted macros
// ---------------------------------------------------------------------------

const LogFoodInput = z.object({
  date: IsoDateSchema,
  mealSlot: MealSlotSchema,
  foodId: UuidSchema,
  servingOptionId: UuidSchema.nullable(),
  quantity: z.number().positive(),
  notes: z.string().nullable().optional(),
});

export async function logFoodAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };

  const parsed = LogFoodInput.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };

  try {
    const row = await logFood(userId, parsed.data);
    return { success: true, data: { id: row.id } };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ---------------------------------------------------------------------------
// deleteLogAction — remove a food log entry
// ---------------------------------------------------------------------------

const DeleteLogInput = z.object({ logId: UuidSchema });

export async function deleteLogAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };

  const parsed = DeleteLogInput.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };

  try {
    await deleteLog(userId, parsed.data.logId);
    return { success: true, data: null };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ---------------------------------------------------------------------------
// updateLogAction — patch an existing log entry (re-snapshots macros)
// ---------------------------------------------------------------------------

const UpdateLogInput = z.object({
  logId: UuidSchema,
  patch: z.object({
    quantity: z.number().positive().optional(),
    servingOptionId: UuidSchema.nullable().optional(),
    mealSlot: MealSlotSchema.optional(),
    notes: z.string().nullable().optional(),
  }),
});

export async function updateLogAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };

  const parsed = UpdateLogInput.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };

  try {
    await updateLog(userId, parsed.data.logId, parsed.data.patch);
    return { success: true, data: null };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ---------------------------------------------------------------------------
// logMealAction — expand a saved meal into food log entries
// ---------------------------------------------------------------------------

const LogMealInput = z.object({
  mealId: UuidSchema,
  date: IsoDateSchema,
  mealSlot: MealSlotSchema,
});

export async function logMealAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };

  const parsed = LogMealInput.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };

  try {
    await logMeal(userId, parsed.data.mealId, parsed.data.date, parsed.data.mealSlot);
    return { success: true, data: null };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ---------------------------------------------------------------------------
// upsertFoodAction — create or refresh a food entry (from OFF or manual)
// ---------------------------------------------------------------------------

const UpsertFoodInput = z.object({
  offBarcode: z.string().nullable().optional(),
  name: z.string().trim().min(1).max(200),
  brand: z.string().trim().max(120).nullable().optional(),
  kcalPer100g: z.union([z.number().nonnegative(), z.string()]),
  proteinPer100g: z.union([z.number().nonnegative(), z.string()]),
  carbsPer100g: z.union([z.number().nonnegative(), z.string()]),
  fatPer100g: z.union([z.number().nonnegative(), z.string()]),
  fiberPer100g: z.union([z.number().nonnegative(), z.string()]).nullable().optional(),
  sodiumPer100g: z.union([z.number().nonnegative(), z.string()]).nullable().optional(),
  baseUnit: z.enum(["g", "ml"]).optional(),
  isManual: z.boolean().optional(),
  servingQuantity: z.number().positive().nullable().optional(),
  servingSizeLabel: z.string().trim().max(100).nullable().optional(),
});

export async function upsertFoodAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };

  const parsed = UpsertFoodInput.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };

  try {
    const result = await upsertFood(userId, parsed.data);
    return { success: true, data: { id: result.food.id } };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ---------------------------------------------------------------------------
// createMealAction — save a reusable meal group
// ---------------------------------------------------------------------------

const CreateMealInput = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  items: z
    .array(
      z.object({
        foodId: UuidSchema,
        servingOptionId: UuidSchema.nullable(),
        quantity: z.number().positive(),
        orderIndex: z.number().int().nonnegative(),
      }),
    )
    .min(1)
    .max(50),
});

export async function createMealAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };

  const parsed = CreateMealInput.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };

  try {
    const result = await createMeal(userId, parsed.data);
    return { success: true, data: { id: result.id } };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ---------------------------------------------------------------------------
// upsertNutritionTargetsAction — update daily macro targets
// D-09: sum=100 validation enforced both here (defense in depth) and in service
// ---------------------------------------------------------------------------

const TargetsInput = z
  .object({
    targetKcal: z.number().int().positive(),
    proteinPct: z.number().min(0).max(100),
    carbsPct: z.number().min(0).max(100),
    fatPct: z.number().min(0).max(100),
  })
  .refine(
    (t) => Math.abs(t.proteinPct + t.carbsPct + t.fatPct - 100) < 0.5,
    {
      message:
        "Percentages must add up to 100. Adjust the values to continue.",
    },
  );

export async function upsertNutritionTargetsAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };

  const parsed = TargetsInput.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };

  try {
    await upsertNutritionTargets(userId, parsed.data);
    return { success: true, data: null };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ---------------------------------------------------------------------------
// copyYesterdayAction — clone all food_logs from yesterday to a target date
// ---------------------------------------------------------------------------

const CopyYesterdayInput = z.object({ toDate: IsoDateSchema });

export async function copyYesterdayAction(
  input: unknown,
): Promise<ActionResult<{ count: number }>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };

  const parsed = CopyYesterdayInput.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };

  // Compute fromDate = toDate - 1 day via date-fns
  const toDateObj = new Date(parsed.data.toDate + "T00:00:00Z");
  const fromDateObj = subDays(toDateObj, 1);
  const fromDate = format(fromDateObj, "yyyy-MM-dd");

  try {
    const result = await copyDayLogs(userId, fromDate, parsed.data.toDate);
    return { success: true, data: result };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
