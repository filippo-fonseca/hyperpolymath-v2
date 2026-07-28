import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { createClient } from "@/lib/supabase/server";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cache } from "react";

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
 *
 * Memoized per request with React.cache. It ran twice on every (app) render:
 * once as the layout's auth gate and once more through requireOnboarded on the
 * page below it, each time paying a getClaims round-trip plus a users select.
 * The redirect still works inside a cached function: it throws, and the cache
 * stores the settled rejection for the request, which is the correct behaviour
 * for a repeated call within the same render.
 * Used by (app)/layout.tsx as the single AUTH-03 gate, and by /onboarding (which doesn't require onboarded).
 * PITFALLS Pitfall 2: uses getClaims (NOT getSession) — JWT signature validation, no spoof risk.
 */
export const getUserOrRedirect = cache(async (): Promise<AuthenticatedUser> => {
  const supabase = await createClient();
  const { data: claimsData, error } = await supabase.auth.getClaims();
  if (error || !claimsData?.claims) {
    redirect("/sign-in");
  }
  const userId = claimsData.claims.sub;

  const cols = {
    id: users.id,
    email: users.email,
    graduationYear: users.graduationYear,
    onboardedAt: users.onboardedAt,
    displayName: users.displayName,
    bio: users.bio,
    avatarUrl: users.avatarUrl,
    githubUsername: users.githubUsername,
  } as const;

  const rows = await db.select(cols).from(users).where(eq(users.id, userId)).limit(1);
  if (rows.length > 0) return rows[0];

  // Self-heal: the auth.users → public.users trigger (migration 0002) normally
  // provisions this row at sign-up. If it didn't fire (trigger missing on this
  // environment, or a race), create it on demand from the validated JWT claims
  // so a legitimately signed-in user is never bounced into a redirect loop.
  // Idempotent via onConflictDoNothing — concurrent requests can't double-insert.
  const claimEmail = (claimsData.claims as { email?: unknown }).email;
  let email = typeof claimEmail === "string" ? claimEmail : "";
  if (!email) {
    const { data: u } = await supabase.auth.getUser();
    email = u.user?.email ?? "";
  }
  await db.insert(users).values({ id: userId, email }).onConflictDoNothing();

  const healed = await db.select(cols).from(users).where(eq(users.id, userId)).limit(1);
  if (healed.length === 0) redirect("/sign-in");
  return healed[0];
});

/**
 * The signed-in user's id, and nothing else.
 *
 * Same gate as getUserOrRedirect (getClaims validates the JWT signature, and an
 * invalid or absent session still redirects to /sign-in), but it stops there
 * instead of also selecting the public.users row. Use it where the id is
 * genuinely all that is wanted, such as a server action whose whole job is to
 * refetch a user-scoped list.
 *
 * It does NOT self-heal a missing public.users row the way getUserOrRedirect
 * does. That is deliberate: the callers here sit under the (app) layout, which
 * has already run the full check for this session, so a heal at this point
 * would be dead code paid for on every call.
 *
 * Memoized per request, like getUserOrRedirect. The two do not share a cache
 * entry, so a request that needs both still pays one users select, not two.
 */
export const getUserIdOrRedirect = cache(async (): Promise<string> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) {
    redirect("/sign-in");
  }
  return data.claims.sub;
});

/**
 * Same as getUserOrRedirect but also forces /onboarding if onboarded_at is NULL.
 * Used by /today and /settings.
 */
export async function requireOnboarded(): Promise<AuthenticatedUser> {
  const user = await getUserOrRedirect();
  if (!user.onboardedAt) redirect("/onboarding");
  return user;
}
