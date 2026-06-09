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
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  githubUsername: string | null;
}

/**
 * Resolves the signed-in user's Google profile avatar URL from Supabase Auth.
 *
 * Supabase + Google OAuth stamps the profile picture URL onto
 * `user.user_metadata.avatar_url` (and sometimes `picture`). This helper does
 * a single round-trip to Auth to read those metadata fields — keep call sites
 * to one per request (e.g. the page loader, not per-component).
 *
 * Returns `{ avatarUrl, initials }` where `initials` is a single-character
 * fallback derived from `full_name` / `name` / email, suitable for an
 * `<AvatarFallback>` when no image is available.
 */
export async function getAuthAvatar(): Promise<{
  avatarUrl: string | null;
  initials: string;
}> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const u = data?.user;
  const meta = (u?.user_metadata ?? {}) as Record<string, unknown>;
  const avatarUrl =
    (typeof meta.avatar_url === "string" && meta.avatar_url) ||
    (typeof meta.picture === "string" && meta.picture) ||
    null;
  const nameSource =
    (typeof meta.full_name === "string" && meta.full_name) ||
    (typeof meta.name === "string" && meta.name) ||
    u?.email ||
    "";
  const initials = nameSource.trim().charAt(0).toUpperCase() || "·";
  return { avatarUrl, initials };
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
      displayName: users.displayName,
      bio: users.bio,
      avatarUrl: users.avatarUrl,
      githubUsername: users.githubUsername,
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
