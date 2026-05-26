"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string };

async function getUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;
  return data.claims.sub;
}

const ProfileSchema = z.object({
  displayName: z
    .string()
    .max(80, "Display name must be 80 characters or fewer")
    .nullable(),
  bio: z
    .string()
    .max(280, "Bio must be 280 characters or fewer")
    .nullable(),
});

const AvatarSchema = z.object({
  avatarUrl: z.string().url().nullable(),
});

/**
 * Save display name + bio. Both nullable — empty string is normalized to null
 * so the column reflects "unset" semantically. Revalidates app shell layout
 * paths so the sidebar chip refreshes server-side fields after the optimistic
 * client update lands.
 */
export async function updateProfile(
  input: unknown,
): Promise<ActionResult<{ displayName: string | null; bio: string | null }>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };

  const parsed = ProfileSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };

  const displayName =
    parsed.data.displayName?.trim() === "" ? null : parsed.data.displayName;
  const bio = parsed.data.bio?.trim() === "" ? null : parsed.data.bio;

  await db
    .update(users)
    .set({ displayName, bio })
    .where(eq(users.id, userId));

  // Sidebar lives at the app group layout boundary; revalidate so the chip
  // re-renders with the new display name on the next navigation.
  revalidatePath("/", "layout");

  return { success: true, data: { displayName, bio } };
}

/**
 * Persist the avatar public URL after a successful Storage upload. The upload
 * itself happens client-side using the browser Supabase client + the
 * authenticated user's RLS — see Storage policies in
 * supabase/migrations/0014_user_profile_and_avatars.sql.
 */
export async function updateAvatarUrl(
  input: unknown,
): Promise<ActionResult<{ avatarUrl: string | null }>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not authenticated" };

  const parsed = AvatarSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };

  await db
    .update(users)
    .set({ avatarUrl: parsed.data.avatarUrl })
    .where(eq(users.id, userId));

  revalidatePath("/", "layout");

  return { success: true, data: { avatarUrl: parsed.data.avatarUrl } };
}
