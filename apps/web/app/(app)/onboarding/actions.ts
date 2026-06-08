"use server";

import { redirect } from "next/navigation";
import { sql, eq } from "drizzle-orm";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { users, areas } from "@/lib/db/schema";

// Default areas seeded on first successful onboarding. Intentionally generic so
// they fit any new user out of the gate — they can rename, archive, or delete
// from the sidebar later. We seed three because a single bare "General" reads
// as placeholder; three suggests the hierarchy without being prescriptive.
const DEFAULT_AREAS: Array<{ name: string; emoji: string }> = [
  { name: "Personal", emoji: "🌿" },
  { name: "Work", emoji: "🛠" },
  { name: "Studies", emoji: "📚" },
];

const OnboardingSchema = z.object({
  displayName: z.string().trim().min(1, "Please enter a name").max(60),
  timezone: z.string().trim().min(1).max(80),
  // Optional — non-students can skip. Schema keeps the nullable shape.
  graduationYear: z
    .union([z.string().length(0), z.string().regex(/^\d{4}$/)])
    .optional(),
});

export interface OnboardingInitialValues {
  displayName: string;
  email: string;
}

/**
 * Reads pre-fill hints from Supabase Auth user_metadata so the onboarding form
 * can land with the user's Google name already filled in. Falls back to empty
 * string for displayName when no metadata is available — the user just types it.
 */
export async function getOnboardingInitialValues(): Promise<OnboardingInitialValues> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const u = data?.user;
  const meta = (u?.user_metadata ?? {}) as Record<string, unknown>;
  const fullName =
    (typeof meta.full_name === "string" && meta.full_name) ||
    (typeof meta.name === "string" && meta.name) ||
    "";
  return {
    displayName: fullName.trim(),
    email: u?.email ?? "",
  };
}

export async function completeOnboarding(formData: FormData): Promise<void> {
  const parsed = OnboardingSchema.safeParse({
    displayName: formData.get("display_name"),
    timezone: formData.get("timezone"),
    graduationYear: formData.get("graduation_year") ?? undefined,
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const supabase = await createClient();
  const { data: claimsData, error } = await supabase.auth.getClaims();
  if (error || !claimsData?.claims) redirect("/sign-in");
  const userId = claimsData.claims.sub;

  const gradYearStr = parsed.data.graduationYear;
  const gradYear =
    gradYearStr && gradYearStr.length === 4 ? parseInt(gradYearStr, 10) : null;

  // BOTH the profile fields AND onboarded_at are set in the same UPDATE so the
  // first-run gate (decideLandingRoute checks onboarded_at) flips atomically.
  await db
    .update(users)
    .set({
      displayName: parsed.data.displayName,
      timezone: parsed.data.timezone,
      graduationYear: gradYear,
      onboardedAt: sql`now()`,
    })
    .where(eq(users.id, userId));

  // Seed default areas — but only if the user doesn't already have any. This
  // makes the action idempotent if the form is somehow submitted twice (e.g.
  // re-running onboarding manually) without duplicating areas.
  const existing = await db
    .select({ id: areas.id })
    .from(areas)
    .where(eq(areas.userId, userId))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(areas).values(
      DEFAULT_AREAS.map((a, i) => ({
        userId,
        name: a.name,
        emoji: a.emoji,
        orderIndex: i,
      })),
    );
  }

  redirect("/today");
}
