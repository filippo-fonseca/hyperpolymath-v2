"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { deleteAllUserData } from "@/lib/db/queries/delete-account";

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

/**
 * Permanently delete the signed-in user's account: every owned row across all
 * tables, plus the Supabase Auth user itself. Irreversible.
 *
 * Gated on the caller re-typing their exact account email — the same check the
 * Danger Zone UI enforces, re-validated server-side so a crafted request can't
 * bypass it. Auth via getClaims() only (CLAUDE.md Critical Pattern 1).
 *
 * Order matters: the data wipe runs in one transaction (deleteAllUserData),
 * then the auth user is removed via the admin API. If the auth removal fails
 * the data is already gone, so we surface that explicitly rather than pretend
 * success. On success we sign out and redirect to /sign-in.
 */
export async function deleteAccountAction(
  confirmation: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: claimsData, error } = await supabase.auth.getClaims();
  if (error || !claimsData?.claims) {
    return { success: false, error: "Not authenticated" };
  }
  const userId = claimsData.claims.sub;

  const [row] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const email = row?.email ?? "";

  if (
    !email ||
    confirmation.trim().toLowerCase() !== email.trim().toLowerCase()
  ) {
    return {
      success: false,
      error: "Confirmation does not match your account email.",
    };
  }

  await deleteAllUserData(userId);

  const admin = createAdminClient();
  const { error: adminError } = await admin.auth.admin.deleteUser(userId);
  if (adminError) {
    return {
      success: false,
      error:
        "Your data was removed but the account could not be fully deleted. Please contact support.",
    };
  }

  await supabase.auth.signOut();
  redirect("/sign-in");
}
