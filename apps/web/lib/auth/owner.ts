import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

/**
 * The single account allowed to use the JARVIS physical / voice-everywhere
 * feature. The realtime bus (`physicalBus` + Supabase broadcast channel) is a
 * single global emitter shared by every instance, so any subscriber would
 * otherwise receive every user's transcripts and response chunks. Until the
 * bus is partitioned per user, the whole feature is restricted to the owner.
 *
 * Override via JARVIS_OWNER_EMAIL if the owner account ever changes.
 */
export const OWNER_EMAIL = (
  process.env.JARVIS_OWNER_EMAIL ?? "filifonsecacagnazzo@gmail.com"
).toLowerCase();

/**
 * True only when `userId` resolves to the owner account. Works regardless of
 * which auth path produced the userId (cookie session, desktop bearer, or
 * query-param token) because it resolves the email from public.users.
 */
export async function isOwnerUser(userId: string): Promise<boolean> {
  if (!userId) return false;
  const rows = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const email = rows[0]?.email?.toLowerCase();
  return !!email && email === OWNER_EMAIL;
}
