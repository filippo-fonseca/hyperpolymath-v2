"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

type ActionResult =
  | { success: true }
  | { success: false; error: string };

export async function updateGraduationYear(formData: FormData): Promise<void> {
  const yearRaw = formData.get("graduation_year");
  const year = typeof yearRaw === "string" ? parseInt(yearRaw, 10) : NaN;
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error(`Invalid graduation year: ${yearRaw}`);
  }

  const supabase = await createClient();
  const { data: claimsData, error } = await supabase.auth.getClaims();
  if (error || !claimsData?.claims) redirect("/sign-in");
  const userId = claimsData.claims.sub;

  await db.update(users).set({ graduationYear: year }).where(eq(users.id, userId));
  revalidatePath("/settings");
  revalidatePath("/today");
}

/**
 * Persist the user's preferred distance unit (km | mi) — D-10. km is the
 * canonical storage unit; this flag only affects display + form input
 * conversion at the surface boundary (lib/training/distance.ts).
 *
 * Auth via getClaims() only (CLAUDE.md Critical Pattern 1 — the session
 * variant is spoofable and forbidden in server code).
 * Validated with Zod before touching Drizzle. Revalidates the surfaces that
 * read users.distance_unit so the new preference takes effect immediately.
 */
const DistanceUnitSchema = z.enum(["km", "mi"]);

export async function updateDistanceUnit(
  unit: "km" | "mi",
): Promise<ActionResult> {
  const parsed = DistanceUnitSchema.safeParse(unit);
  if (!parsed.success) {
    return { success: false, error: "Invalid distance unit" };
  }

  const supabase = await createClient();
  const { data: claimsData, error } = await supabase.auth.getClaims();
  if (error || !claimsData?.claims) {
    return { success: false, error: "Not authenticated" };
  }
  const userId = claimsData.claims.sub;

  await db
    .update(users)
    .set({ distanceUnit: parsed.data })
    .where(eq(users.id, userId));

  revalidatePath("/settings");
  revalidatePath("/training");
  revalidatePath("/lifeos");
  return { success: true };
}
