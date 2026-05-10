"use server";

import { redirect } from "next/navigation";
import { sql, eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export async function completeOnboarding(formData: FormData): Promise<void> {
  const yearRaw = formData.get("graduation_year");
  const year = typeof yearRaw === "string" ? parseInt(yearRaw, 10) : NaN;
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error(`Invalid graduation year: ${yearRaw}`);
  }

  const supabase = await createClient();
  const { data: claimsData, error } = await supabase.auth.getClaims();
  if (error || !claimsData?.claims) redirect("/sign-in");
  const userId = claimsData.claims.sub;

  // CRITICAL: BOTH graduation_year AND onboarded_at MUST be set in the same UPDATE.
  // The onboarded_at timestamp is the first-run flag — graduation_year alone is INSUFFICIENT.
  // Subsequent sign-ins check onboarded_at to skip /onboarding (decideLandingRoute).
  await db
    .update(users)
    .set({ graduationYear: year, onboardedAt: sql`now()` })
    .where(eq(users.id, userId));

  redirect("/today");
}
