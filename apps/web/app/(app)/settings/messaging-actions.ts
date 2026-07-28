"use server";

/**
 * Server Action for the /settings "Messaging" section (issue #352).
 *
 *   - setSmsJarvisEnabled(enabled) — open or close the inbound text channel.
 *
 * The flag is checked by the webhook BEFORE a turn is spent, so switching it
 * off does not merely mute the reply: an inbound message costs zero Anthropic
 * calls while the channel is closed, and leaves a ledger row saying so.
 *
 * Auth via getClaims() only (CLAUDE.md Critical Pattern 1 — the session reader
 * is spoofable and forbidden in server code). Scoped to the caller's own user
 * id; no phone number or credential ever crosses the wire.
 */

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

type ToggleResult = { success: true } | { success: false; error: string };

const EnabledSchema = z.boolean();

async function requireUserId(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) {
    return { ok: false, error: "Not authenticated" };
  }
  return { ok: true, userId: data.claims.sub };
}

/**
 * Open or close the inbound text channel for the signed-in user.
 */
export async function setSmsJarvisEnabled(enabled: boolean): Promise<ToggleResult> {
  const parsed = EnabledSchema.safeParse(enabled);
  if (!parsed.success) {
    return { success: false, error: "Invalid value" };
  }

  const auth = await requireUserId();
  if (!auth.ok) return { success: false, error: auth.error };

  await db
    .update(users)
    .set({ smsJarvisEnabled: parsed.data })
    .where(eq(users.id, auth.userId));

  revalidatePath("/settings");
  return { success: true };
}
