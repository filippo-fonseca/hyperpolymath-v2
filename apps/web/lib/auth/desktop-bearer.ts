import "server-only";
import { createHash } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { desktopDevices } from "@/lib/db/schema";

export interface DesktopBearerIdentity {
  userId: string;
  /** The minted token's user-facing name (e.g. "MacBook", "iPhone"). */
  deviceName: string;
}

/**
 * Validate `Authorization: Bearer hpd_...` from a paired device and return
 * the full identity (userId + device name). Device name is used for capture
 * provenance — callers should DENORMALIZE it into rows they create so the
 * record survives token revocation/deletion.
 *
 * Side-effect: updates `last_used_at` (fire-and-forget so we don't block the
 * hot path; if the write fails, we still return the authed identity).
 */
export async function validateDesktopBearerIdentity(
  req: Request,
): Promise<DesktopBearerIdentity | null> {
  const auth = req.headers.get("authorization");
  if (!auth || !auth.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  if (!token.startsWith("hpd_")) return null;

  const hash = createHash("sha256").update(token).digest("hex");
  const rows = await db
    .select({
      id: desktopDevices.id,
      userId: desktopDevices.userId,
      name: desktopDevices.name,
    })
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

  return { userId: row.userId, deviceName: row.name };
}

/**
 * Validate `Authorization: Bearer hpd_...` from the desktop app.
 * Returns the user_id the token belongs to, or null if missing/invalid/revoked.
 */
export async function validateDesktopBearer(
  req: Request,
): Promise<string | null> {
  const identity = await validateDesktopBearerIdentity(req);
  return identity?.userId ?? null;
}
