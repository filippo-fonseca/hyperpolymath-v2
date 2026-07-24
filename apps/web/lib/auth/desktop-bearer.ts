import "server-only";
import { createHash } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { desktopDevices } from "@/lib/db/schema";
import { createAdminClient } from "@/lib/supabase/admin";

export interface DesktopBearerIdentity {
  userId: string;
  /** The minted token's user-facing name (e.g. "MacBook", "iPhone"). */
  deviceName: string;
}

/**
 * Validate `Authorization: Bearer …` from a paired device / mobile client
 * and return the full identity (userId + device name).
 *
 * Accepts two token kinds:
 *   1. `hpd_…` device tokens minted at /settings/desktop (hash lookup in
 *      `desktop_devices`). Device name is the minted label.
 *   2. Supabase access JWTs from mobile Google OAuth. Validated via the
 *      Auth Admin API (`getUser(jwt)`). Device name is `"Mobile"`.
 *
 * Device name is used for capture provenance — callers should DENORMALIZE
 * it into rows they create so the record survives token revocation.
 *
 * Side-effect (hpd_ path only): updates `last_used_at` (fire-and-forget).
 */
export async function validateDesktopBearerIdentity(
  req: Request,
): Promise<DesktopBearerIdentity | null> {
  const auth = req.headers.get("authorization");
  if (!auth || !auth.startsWith("Bearer ")) return null;
  const token = auth.slice(7).trim();
  if (!token) return null;

  if (token.startsWith("hpd_")) {
    return validateHpdToken(token);
  }

  return validateSupabaseAccessToken(token);
}

async function validateHpdToken(
  token: string,
): Promise<DesktopBearerIdentity | null> {
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
 * Validate a Supabase access JWT (mobile Google OAuth). Uses the service-role
 * admin client so we don't need cookies — just the bearer token the phone
 * sends on every request.
 */
async function validateSupabaseAccessToken(
  jwt: string,
): Promise<DesktopBearerIdentity | null> {
  // Cheap reject: JWTs are three base64 segments. Avoid hitting Auth Admin
  // for obviously-wrong garbage (empty, hpd_ misspellings already handled).
  if (jwt.split(".").length !== 3) return null;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.getUser(jwt);
    if (error || !data.user?.id) return null;
    return { userId: data.user.id, deviceName: "Mobile" };
  } catch {
    // Missing service-role env in a misconfigured deploy → treat as unauthed
    // rather than 500ing every mobile request.
    return null;
  }
}

/**
 * Validate `Authorization: Bearer …` from desktop / mobile.
 * Returns the user_id the token belongs to, or null if missing/invalid/revoked.
 */
export async function validateDesktopBearer(
  req: Request,
): Promise<string | null> {
  const identity = await validateDesktopBearerIdentity(req);
  return identity?.userId ?? null;
}
