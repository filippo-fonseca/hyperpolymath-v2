import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export interface AuthenticatedUser {
  id: string;
  email: string;
  graduationYear: number | null;
  onboardedAt: Date | null;
}

/**
 * Validates session and returns the public.users row.
 * Redirects to /sign-in if not authenticated.
 * Used by (app)/layout.tsx as the single AUTH-03 gate, and by /onboarding (which doesn't require onboarded).
 * PITFALLS Pitfall 2: uses getClaims (NOT getSession) — JWT signature validation, no spoof risk.
 */
export async function getUserOrRedirect(): Promise<AuthenticatedUser> {
  const supabase = await createClient();
  const { data: claimsData, error } = await supabase.auth.getClaims();
  if (error || !claimsData?.claims) {
    redirect("/sign-in");
  }
  const userId = claimsData.claims.sub;

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      graduationYear: users.graduationYear,
      onboardedAt: users.onboardedAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (rows.length === 0) {
    // Trigger (Plan 02 migration 0002) should have created this; defensive bail if missing
    redirect("/sign-in");
  }
  return rows[0];
}

/**
 * Same as getUserOrRedirect but also forces /onboarding if onboarded_at is NULL.
 * Used by /today and /settings.
 */
export async function requireOnboarded(): Promise<AuthenticatedUser> {
  const user = await getUserOrRedirect();
  if (!user.onboardedAt) redirect("/onboarding");
  return user;
}
