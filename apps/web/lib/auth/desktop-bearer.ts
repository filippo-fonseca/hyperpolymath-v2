import "server-only";
import { createHash } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { desktopDevices } from "@/lib/db/schema";

/**
 * Validate `Authorization: Bearer hpd_...` from the desktop app.
 *
 * Returns the user_id the token belongs to, or null if missing/invalid/revoked.
 * Side-effect: updates `last_used_at` (fire-and-forget so we don't block the
 * hot path; if the write fails, we still return the authed user_id).
 */
export async function validateDesktopBearer(
  req: Request,
): Promise<string | null> {
  const auth = req.headers.get("authorization");
  if (!auth || !auth.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  if (!token.startsWith("hpd_")) return null;

  const hash = createHash("sha256").update(token).digest("hex");
  const rows = await db
    .select({ id: desktopDevices.id, userId: desktopDevices.userId })
    .from(desktopDevices)
    .where(
      and(
        eq(desktopDevices.tokenHash, hash),
        isNull(desktopDevices.revokedAt),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  // Fire-and-forget last_used_at update.
  void db
    .update(desktopDevices)
    .set({ lastUsedAt: sql`now()` })
    .where(eq(desktopDevices.id, row.id))
    .catch(() => undefined);

  return row.userId;
}
