/**
 * nutrition-service.ts — JARVIS-ready service layer for the nutrition feature.
 *
 * D-14 architecture (from RESEARCH.md): All mutations live here. Server Actions
 * are thin wrappers that add auth (getClaims) + Zod validation + call into this
 * layer. Every function accepts userId as the FIRST parameter. The caller
 * (Server Action / route handler) is responsible for reading userId from
 * getClaims() — this layer NEVER reads auth state itself.
 *
 * This makes the service portable to JARVIS tool calls without an HTTP context.
 *
 * NO "use server" directive here — this is a plain module importable in any
 * server context.
 */

import { and, asc, desc, eq, ilike, sql } from "drizzle-orm";
import { format, subDays } from "date-fns";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  foods,
  foodLogs,
  foodServingOptions,
  meals,
  mealItems,
  nutritionTargets,
  type mealSlotEnum,
} from "@/lib/db/schema";
import { computeMacros, resolveBaseAmount } from "./macro-math";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MealSlot = "breakfast" | "lunch" | "dinner" | "snacks";

export type LogFoodInput = {
  date: string;
  mealSlot: MealSlot;
  foodId: string;
  servingOptionId: string | null;
  quantity: number;
  notes?: string | null;
};

export type UpsertFoodInput = {
  offBarcode?: string | null;
  name: string;
  brand?: string | null;
  kcalPer100g: string | number;
  proteinPer100g: string | number;
  carbsPer100g: string | number;
  fatPer100g: string | number;
  fiberPer100g?: string | number | null;
  sodiumPer100g?: string | number | null;
  baseUnit?: "g" | "ml";
  isManual?: boolean;
  // Product serving (from OFF or manual) — if present, seeded as isDefault:true
  servingQuantity?: number | null;
  servingSizeLabel?: string | null;
};

export type CreateMealInput = {
  name: string;
  description?: string | null;
  items: Array<{
    foodId: string;
    servingOptionId: string | null;
    quantity: number;
    orderIndex: number;
  }>;
};

export type UpsertNutritionTargetsInput = {
  targetKcal: number;
  proteinPct: number;
  carbsPct: number;
  fatPct: number;
};

// ---------------------------------------------------------------------------
// Shared Zod validators (used internally for D-09 constraints)
// ---------------------------------------------------------------------------

const NutritionTargetsSchema = z
  .object({
    targetKcal: z.number().int().positive(),
    proteinPct: z.number().min(0).max(100),
    carbsPct: z.number().min(0).max(100),
    fatPct: z.number().min(0).max(100),
  })
  .refine((t) => Math.abs(t.proteinPct + t.carbsPct + t.fatPct - 100) < 0.5, {
    message: "Percentages must add up to 100. Adjust the values to continue.",
  });

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Coerce a string | number to a plain number for arithmetic */
const toN = (v: string | number | null | undefined): number => {
  if (v == null) return 0;
  return typeof v === "number" ? v : parseFloat(v) || 0;
};

/**
 * Fetch the food row + serving option and compute snapshotted macros.
 * Uses double-WHERE (userId) to ensure ownership.
 * Falls back to 100g serving when no servingOptionId is given.
 */
async function resolveFoodAndMacros(
  userId: string,
  foodId: string,
  servingOptionId: string | null,
  quantity: number,
): Promise<{
  kcal: number;
  proteinG: string;
  carbsG: string;
  fatG: string;
  fiberG: string | null;
}> {
  // 1. Fetch food row (userId double-WHERE for ownership)
  const [food] = await db
    .select({
      id: foods.id,
      kcalPer100g: foods.kcalPer100g,
      proteinPer100g: foods.proteinPer100g,
      carbsPer100g: foods.carbsPer100g,
      fatPer100g: foods.fatPer100g,
      fiberPer100g: foods.fiberPer100g,
    })
    .from(foods)
    .where(and(eq(foods.id, foodId), eq(foods.userId, userId)))
    .limit(1);

  if (!food) throw new Error(`Food not found: ${foodId}`);

  // 2. Fetch serving option (if provided) — ownership enforced via userId
  let gramsOrMl = 100; // default: treat as 100g
  if (servingOptionId) {
    const [serving] = await db
      .select({ gramsOrMl: foodServingOptions.gramsOrMl })
      .from(foodServingOptions)
      .where(
        and(
          eq(foodServingOptions.id, servingOptionId),
          eq(foodServingOptions.userId, userId),
        ),
      )
      .limit(1);

    if (!serving) throw new Error(`Serving option not found: ${servingOptionId}`);
    gramsOrMl = toN(serving.gramsOrMl);
  }

  // 3. Compute macros via pure function
  const baseAmount = resolveBaseAmount(quantity, gramsOrMl);
  const macros = computeMacros(baseAmount, {
    kcalPer100g: food.kcalPer100g,
    proteinPer100g: food.proteinPer100g,
    carbsPer100g: food.carbsPer100g,
    fatPer100g: food.fatPer100g,
    fiberPer100g: food.fiberPer100g,
  });

  return {
    kcal: macros.kcal,
    proteinG: macros.proteinG.toString(),
    carbsG: macros.carbsG.toString(),
    fatG: macros.fatG.toString(),
    fiberG: macros.fiberG != null ? macros.fiberG.toString() : null,
  };
}

// ---------------------------------------------------------------------------
// logFood — log a food item to a meal slot, snapshotting macros at log time
// ---------------------------------------------------------------------------

export async function logFood(userId: string, input: LogFoodInput) {
  const { kcal, proteinG, carbsG, fatG, fiberG } = await resolveFoodAndMacros(
    userId,
    input.foodId,
    input.servingOptionId,
    input.quantity,
  );

  const [row] = await db
    .insert(foodLogs)
    .values({
      userId,
      logDate: input.date,
      mealSlot: input.mealSlot,
      foodId: input.foodId,
      servingOptionId: input.servingOptionId,
      quantity: input.quantity.toString(),
      // Snapshotted macros — immutable to future food edits (RESEARCH Pitfall 1)
      kcal,
      proteinG,
      carbsG,
      fatG,
      fiberG,
      notes: input.notes ?? null,
    })
    .returning();

  // Bump foods.useCount + lastUsedAt (best-effort — don't fail the log if this errors)
  await db
    .update(foods)
    .set({ useCount: sql`use_count + 1`, lastUsedAt: sql`now()`, updatedAt: sql`now()` })
    .where(and(eq(foods.id, input.foodId), eq(foods.userId, userId)));

  return row!;
}

// ---------------------------------------------------------------------------
// deleteLog — hard delete; double-WHERE ownership
// ---------------------------------------------------------------------------

export async function deleteLog(userId: string, logId: string): Promise<void> {
  await db
    .delete(foodLogs)
    .where(and(eq(foodLogs.id, logId), eq(foodLogs.userId, userId)));
}

// ---------------------------------------------------------------------------
// updateLog — patch a log entry, re-snapshotting macros if quantity/serving changes
// ---------------------------------------------------------------------------

export type UpdateLogPatch = {
  quantity?: number;
  servingOptionId?: string | null;
  mealSlot?: MealSlot;
  notes?: string | null;
};

export async function updateLog(
  userId: string,
  logId: string,
  patch: UpdateLogPatch,
): Promise<void> {
  // Fetch existing log to re-snapshot macros if quantity/serving changes
  const [existing] = await db
    .select({
      foodId: foodLogs.foodId,
      servingOptionId: foodLogs.servingOptionId,
      quantity: foodLogs.quantity,
    })
    .from(foodLogs)
    .where(and(eq(foodLogs.id, logId), eq(foodLogs.userId, userId)))
    .limit(1);

  if (!existing) throw new Error(`Log not found: ${logId}`);

  const newQuantity = patch.quantity ?? toN(existing.quantity);
  const newServingId = patch.servingOptionId !== undefined
    ? patch.servingOptionId
    : existing.servingOptionId;

  // Re-snapshot macros if quantity or serving changed
  const macros = await resolveFoodAndMacros(
    userId,
    existing.foodId,
    newServingId,
    newQuantity,
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: Record<string, any> = {
    kcal: macros.kcal,
    proteinG: macros.proteinG,
    carbsG: macros.carbsG,
    fatG: macros.fatG,
    fiberG: macros.fiberG,
    quantity: newQuantity.toString(),
    servingOptionId: newServingId,
  };

  if (patch.mealSlot !== undefined) updates.mealSlot = patch.mealSlot;
  if (patch.notes !== undefined) updates.notes = patch.notes;

  await db
    .update(foodLogs)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .set(updates as any)
    .where(and(eq(foodLogs.id, logId), eq(foodLogs.userId, userId)));
}

// ---------------------------------------------------------------------------
// logMeal — expand a saved meal into individual food_logs rows (transactional)
// ---------------------------------------------------------------------------

export async function logMeal(
  userId: string,
  mealId: string,
  date: string,
  mealSlot: MealSlot,
): Promise<void> {
  // Fetch meal + items (double-WHERE ownership)
  const [meal] = await db
    .select({ id: meals.id, name: meals.name })
    .from(meals)
    .where(and(eq(meals.id, mealId), eq(meals.userId, userId)))
    .limit(1);

  if (!meal) throw new Error(`Meal not found: ${mealId}`);

  const items = await db
    .select({
      foodId: mealItems.foodId,
      servingOptionId: mealItems.servingOptionId,
      quantity: mealItems.quantity,
    })
    .from(mealItems)
    .where(and(eq(mealItems.mealId, mealId), eq(mealItems.userId, userId)));

  if (items.length === 0) return; // empty meal — no logs to create

  await db.transaction(async (tx) => {
    for (const item of items) {
      const { kcal, proteinG, carbsG, fatG, fiberG } = await resolveFoodAndMacros(
        userId,
        item.foodId,
        item.servingOptionId,
        toN(item.quantity),
      );

      await tx.insert(foodLogs).values({
        userId,
        logDate: date,
        mealSlot,
        foodId: item.foodId,
        servingOptionId: item.servingOptionId,
        quantity: item.quantity,
        kcal,
        proteinG,
        carbsG,
        fatG,
        fiberG,
      });
    }

    // Bump meal usage
    await tx
      .update(meals)
      .set({ useCount: sql`use_count + 1`, lastUsedAt: sql`now()`, updatedAt: sql`now()` })
      .where(and(eq(meals.id, mealId), eq(meals.userId, userId)));
  });
}

// ---------------------------------------------------------------------------
// upsertFood — create or refresh a food entry + seed serving options
// ---------------------------------------------------------------------------

export async function upsertFood(
  userId: string,
  input: UpsertFoodInput,
): Promise<{ food: { id: string; name: string }; servingOptions: { id: string }[] }> {
  const baseUnit = input.baseUnit ?? "g";
  const defaultServingLabel = baseUnit === "ml" ? "100 ml" : "100 g";

  // Insert food — ON CONFLICT (user_id, off_barcode) DO UPDATE if barcode present
  let foodRow: { id: string; name: string };

  if (input.offBarcode) {
    const [row] = await db
      .insert(foods)
      .values({
        userId,
        offBarcode: input.offBarcode,
        name: input.name,
        brand: input.brand ?? null,
        kcalPer100g: input.kcalPer100g.toString(),
        proteinPer100g: input.proteinPer100g.toString(),
        carbsPer100g: input.carbsPer100g.toString(),
        fatPer100g: input.fatPer100g.toString(),
        fiberPer100g: input.fiberPer100g != null ? input.fiberPer100g.toString() : null,
        sodiumPer100g: input.sodiumPer100g != null ? input.sodiumPer100g.toString() : null,
        baseUnit,
        isManual: false,
      })
      .onConflictDoUpdate({
        target: [foods.userId, foods.offBarcode],
        set: {
          name: input.name,
          brand: input.brand ?? null,
          kcalPer100g: input.kcalPer100g.toString(),
          proteinPer100g: input.proteinPer100g.toString(),
          carbsPer100g: input.carbsPer100g.toString(),
          fatPer100g: input.fatPer100g.toString(),
          fiberPer100g: input.fiberPer100g != null ? input.fiberPer100g.toString() : null,
          sodiumPer100g: input.sodiumPer100g != null ? input.sodiumPer100g.toString() : null,
          updatedAt: sql`now()`,
        },
      })
      .returning({ id: foods.id, name: foods.name });

    foodRow = row!;
  } else {
    // Manual food — plain insert
    const [row] = await db
      .insert(foods)
      .values({
        userId,
        offBarcode: null,
        name: input.name,
        brand: input.brand ?? null,
        kcalPer100g: input.kcalPer100g.toString(),
        proteinPer100g: input.proteinPer100g.toString(),
        carbsPer100g: input.carbsPer100g.toString(),
        fatPer100g: input.fatPer100g.toString(),
        fiberPer100g: input.fiberPer100g != null ? input.fiberPer100g.toString() : null,
        sodiumPer100g: input.sodiumPer100g != null ? input.sodiumPer100g.toString() : null,
        baseUnit,
        isManual: true,
      })
      .returning({ id: foods.id, name: foods.name });

    foodRow = row!;
  }

  const servingOptions: { id: string }[] = [];

  // Determine whether we have a product serving (OFF or manually specified)
  const hasProductServing =
    input.servingQuantity != null && input.servingQuantity > 0;

  if (hasProductServing) {
    // Product serving is default (isDefault: true), 100g/ml becomes secondary
    const [productServing] = await db
      .insert(foodServingOptions)
      .values({
        foodId: foodRow.id,
        userId,
        label: input.servingSizeLabel ?? `1 serving (${input.servingQuantity}${baseUnit})`,
        gramsOrMl: input.servingQuantity!.toString(),
        isDefault: true,
        orderIndex: 0,
      })
      .returning({ id: foodServingOptions.id });
    servingOptions.push({ id: productServing!.id });

    // 100g/ml becomes the secondary option
    const [defaultServing] = await db
      .insert(foodServingOptions)
      .values({
        foodId: foodRow.id,
        userId,
        label: defaultServingLabel,
        gramsOrMl: "100",
        isDefault: false,
        orderIndex: 1,
      })
      .returning({ id: foodServingOptions.id });
    servingOptions.push({ id: defaultServing!.id });
  } else {
    // No product serving — 100g/ml is the only (default) option
    const [defaultServing] = await db
      .insert(foodServingOptions)
      .values({
        foodId: foodRow.id,
        userId,
        label: defaultServingLabel,
        gramsOrMl: "100",
        isDefault: true,
        orderIndex: 0,
      })
      .returning({ id: foodServingOptions.id });
    servingOptions.push({ id: defaultServing!.id });
  }

  return { food: foodRow, servingOptions };
}

// ---------------------------------------------------------------------------
// createMeal — save a reusable meal group + its items (transactional)
// ---------------------------------------------------------------------------

export async function createMeal(
  userId: string,
  input: CreateMealInput,
): Promise<{ id: string }> {
  return await db.transaction(async (tx) => {
    const [meal] = await tx
      .insert(meals)
      .values({
        userId,
        name: input.name,
        description: input.description ?? null,
      })
      .returning({ id: meals.id });

    const mealId = meal!.id;

    // Verify all foodIds + servingOptionIds belong to user before inserting
    for (const item of input.items) {
      const [food] = await tx
        .select({ id: foods.id })
        .from(foods)
        .where(and(eq(foods.id, item.foodId), eq(foods.userId, userId)))
        .limit(1);
      if (!food) throw new Error(`Food not found: ${item.foodId}`);

      if (item.servingOptionId) {
        const [serving] = await tx
          .select({ id: foodServingOptions.id })
          .from(foodServingOptions)
          .where(
            and(
              eq(foodServingOptions.id, item.servingOptionId),
              eq(foodServingOptions.userId, userId),
            ),
          )
          .limit(1);
        if (!serving)
          throw new Error(`Serving option not found: ${item.servingOptionId}`);
      }

      await tx.insert(mealItems).values({
        mealId,
        userId,
        foodId: item.foodId,
        servingOptionId: item.servingOptionId,
        quantity: item.quantity.toString(),
        orderIndex: item.orderIndex,
      });
    }

    return { id: mealId };
  });
}

// ---------------------------------------------------------------------------
// listFoodLogsForDay — query logs for a specific date, ordered by slot + time
// ---------------------------------------------------------------------------

export async function listFoodLogsForDay(userId: string, date: string) {
  return await db
    .select({
      log: foodLogs,
      food: {
        id: foods.id,
        name: foods.name,
        brand: foods.brand,
        baseUnit: foods.baseUnit,
      },
      serving: {
        id: foodServingOptions.id,
        label: foodServingOptions.label,
        gramsOrMl: foodServingOptions.gramsOrMl,
      },
    })
    .from(foodLogs)
    .leftJoin(foods, eq(foodLogs.foodId, foods.id))
    .leftJoin(foodServingOptions, eq(foodLogs.servingOptionId, foodServingOptions.id))
    .where(and(eq(foodLogs.userId, userId), eq(foodLogs.logDate, date)))
    .orderBy(asc(foodLogs.mealSlot), asc(foodLogs.createdAt));
}

// ---------------------------------------------------------------------------
// getFoodHistory — personal food history, sorted by recency + use count
// (D-02: history-first search surface)
// ---------------------------------------------------------------------------

export async function getFoodHistory(
  userId: string,
  opts: { limit?: number; query?: string } = {},
) {
  const limit = opts.limit ?? 20;

  const conditions = [eq(foods.userId, userId)];
  if (opts.query) {
    conditions.push(ilike(foods.name, `%${opts.query}%`));
  }

  return await db
    .select({
      id: foods.id,
      name: foods.name,
      brand: foods.brand,
      kcalPer100g: foods.kcalPer100g,
      proteinPer100g: foods.proteinPer100g,
      carbsPer100g: foods.carbsPer100g,
      fatPer100g: foods.fatPer100g,
      baseUnit: foods.baseUnit,
      lastUsedAt: foods.lastUsedAt,
      useCount: foods.useCount,
    })
    .from(foods)
    .where(and(...conditions))
    .orderBy(desc(foods.lastUsedAt), desc(foods.useCount))
    .limit(limit);
}

// ---------------------------------------------------------------------------
// getNutritionTargets — get user's targets, falling back to defaults
// ---------------------------------------------------------------------------

const DEFAULT_TARGETS = {
  targetKcal: 2000,
  proteinPct: 30,
  carbsPct: 40,
  fatPct: 30,
};

export async function getNutritionTargets(userId: string) {
  const [row] = await db
    .select()
    .from(nutritionTargets)
    .where(eq(nutritionTargets.userId, userId))
    .limit(1);

  if (!row) return DEFAULT_TARGETS;

  return {
    targetKcal: row.targetKcal,
    proteinPct: toN(row.proteinPct),
    carbsPct: toN(row.carbsPct),
    fatPct: toN(row.fatPct),
  };
}

// ---------------------------------------------------------------------------
// upsertNutritionTargets — set / update user's daily macro targets
// ---------------------------------------------------------------------------

export async function upsertNutritionTargets(
  userId: string,
  input: UpsertNutritionTargetsInput,
): Promise<void> {
  // Zod validation (D-09 sum=100 constraint — defense in depth)
  NutritionTargetsSchema.parse(input);

  await db
    .insert(nutritionTargets)
    .values({
      userId,
      targetKcal: input.targetKcal,
      proteinPct: input.proteinPct.toString(),
      carbsPct: input.carbsPct.toString(),
      fatPct: input.fatPct.toString(),
    })
    .onConflictDoUpdate({
      target: [nutritionTargets.userId],
      set: {
        targetKcal: input.targetKcal,
        proteinPct: input.proteinPct.toString(),
        carbsPct: input.carbsPct.toString(),
        fatPct: input.fatPct.toString(),
        updatedAt: sql`now()`,
      },
    });
}

// ---------------------------------------------------------------------------
// copyDayLogs — clone all food_logs from one date to another
// (RESEARCH Q4 "Copy yesterday" feature)
// ---------------------------------------------------------------------------

export async function copyDayLogs(
  userId: string,
  fromDate: string,
  toDate: string,
): Promise<{ count: number }> {
  const sourceLogs = await db
    .select()
    .from(foodLogs)
    .where(and(eq(foodLogs.userId, userId), eq(foodLogs.logDate, fromDate)));

  if (sourceLogs.length === 0) return { count: 0 };

  await db.insert(foodLogs).values(
    sourceLogs.map((log) => ({
      userId: log.userId,
      logDate: toDate,
      mealSlot: log.mealSlot,
      foodId: log.foodId,
      servingOptionId: log.servingOptionId,
      quantity: log.quantity,
      // Preserve snapshotted macros from the source log
      kcal: log.kcal,
      proteinG: log.proteinG,
      carbsG: log.carbsG,
      fatG: log.fatG,
      fiberG: log.fiberG,
      notes: log.notes,
    })),
  );

  return { count: sourceLogs.length };
}

// ---------------------------------------------------------------------------
// getYearlyAdherence — 365-day adherence array for the heat map (D-11)
// ---------------------------------------------------------------------------

export type DailyAdherence = {
  date: string;
  kcal: number;
  targetKcal: number;
  level: 0 | 1 | 2 | 3 | 4;
};

export async function getYearlyAdherence(
  userId: string,
): Promise<DailyAdherence[]> {
  // Get targetKcal (one global per D-09)
  const targets = await getNutritionTargets(userId);

  // Aggregate kcal by log_date for the past 365 days (RLS-safe Drizzle group-by)
  const rows = await db
    .select({
      date: foodLogs.logDate,
      kcal: sql<number>`COALESCE(SUM(${foodLogs.kcal}), 0)::int`,
    })
    .from(foodLogs)
    .where(
      and(
        eq(foodLogs.userId, userId),
        sql`${foodLogs.logDate} >= CURRENT_DATE - INTERVAL '364 days'`,
      ),
    )
    .groupBy(foodLogs.logDate);

  const byDate = new Map(rows.map((r) => [r.date, Number(r.kcal)]));

  // Build 365-day array including empty days
  const out: DailyAdherence[] = [];
  for (let i = 364; i >= 0; i--) {
    const d = format(subDays(new Date(), i), "yyyy-MM-dd");
    const kcal = byDate.get(d) ?? 0;
    const ratio = targets.targetKcal > 0 ? kcal / targets.targetKcal : 0;
    let level: 0 | 1 | 2 | 3 | 4;
    if (kcal === 0) level = 0;
    else if (ratio < 0.4) level = 1;
    else if (ratio < 0.7) level = 2;
    else if (ratio < 1.0) level = 3;
    else level = 4;
    out.push({ date: d, kcal, targetKcal: targets.targetKcal, level });
  }
  return out;
}

// ---------------------------------------------------------------------------
// get7DayMacroTrend — last 7 days of macro totals for the trend chart (D-11)
// ---------------------------------------------------------------------------

export type DailyMacros = {
  date: string;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

export async function get7DayMacroTrend(
  userId: string,
): Promise<DailyMacros[]> {
  // Aggregate by date for last 7 days
  const rows = await db
    .select({
      date: foodLogs.logDate,
      proteinG: sql<string>`COALESCE(SUM(${foodLogs.proteinG}), 0)`,
      carbsG: sql<string>`COALESCE(SUM(${foodLogs.carbsG}), 0)`,
      fatG: sql<string>`COALESCE(SUM(${foodLogs.fatG}), 0)`,
    })
    .from(foodLogs)
    .where(
      and(
        eq(foodLogs.userId, userId),
        sql`${foodLogs.logDate} >= CURRENT_DATE - INTERVAL '6 days'`,
      ),
    )
    .groupBy(foodLogs.logDate);

  const byDate = new Map(rows.map((r) => [r.date, r]));
  const out: DailyMacros[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = format(subDays(new Date(), i), "yyyy-MM-dd");
    const r = byDate.get(d);
    out.push({
      date: d,
      proteinG: Number(r?.proteinG ?? 0),
      carbsG: Number(r?.carbsG ?? 0),
      fatG: Number(r?.fatG ?? 0),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// getPersonalBests — longest streak, highest single-day kcal, best adherence
// (D-12 bounded to 3 stats sections per UI-SPEC)
// ---------------------------------------------------------------------------

export async function getPersonalBests(userId: string): Promise<{
  longestStreakDays: number;
  highestKcal: number;
  bestAdherencePct: number;
}> {
  // Pull yearly adherence and compute in JS (simple, RLS-safe)
  const adherence = await getYearlyAdherence(userId);
  let longest = 0;
  let current = 0;
  for (const d of adherence) {
    if (d.kcal > 0) {
      current++;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  const highest = adherence.reduce((m, d) => Math.max(m, d.kcal), 0);
  const targetKcal = adherence[0]?.targetKcal ?? 2000;
  const bestAdherence = adherence.reduce((m, d) => {
    const r = targetKcal > 0 ? d.kcal / targetKcal : 0;
    // Best adherence = closest-to-1.0 ratio (over or under penalized equally)
    const score = 1 - Math.abs(1 - Math.min(r, 2));
    return Math.max(m, score);
  }, 0);
  return {
    longestStreakDays: longest,
    highestKcal: highest,
    bestAdherencePct: Math.round(bestAdherence * 100),
  };
}
