"use server";

import { randomBytes, createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { desktopDevices } from "@/lib/db/schema";

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string };

async function getUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;
  return data.claims.sub;
}

export interface DesktopDeviceRow {
  id: string;
  name: string;
  createdAt: Date;
  lastUsedAt: Date | null;
}

export async function listDesktopDevices(): Promise<ActionResult<DesktopDeviceRow[]>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not signed in" };

  const rows = await db
    .select({
      id: desktopDevices.id,
      name: desktopDevices.name,
      createdAt: desktopDevices.createdAt,
      lastUsedAt: desktopDevices.lastUsedAt,
    })
    .from(desktopDevices)
    .where(
      and(
        eq(desktopDevices.userId, userId),
        isNull(desktopDevices.revokedAt),
      ),
    )
    .orderBy(desktopDevices.createdAt);

  return { success: true, data: rows };
}

/**
 * Mint a new desktop device token. The plaintext is returned ONCE and never
 * stored — only its sha256 hash. The user must copy the token immediately.
 */
export async function mintDesktopDevice(
  formData: FormData,
): Promise<ActionResult<{ id: string; token: string }>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not signed in" };

  const rawName = formData.get("name");
  const name =
    typeof rawName === "string" && rawName.trim().length > 0
      ? rawName.trim().slice(0, 80)
      : "Desktop";

  // 32 bytes = 256 bits of entropy, base64url-encoded (~43 chars).
  // Prefixed `hpd_` so the server can fast-reject non-desktop bearers.
  const tokenSecret = randomBytes(32).toString("base64url");
  const token = `hpd_${tokenSecret}`;
  const tokenHash = createHash("sha256").update(token).digest("hex");

  const [row] = await db
    .insert(desktopDevices)
    .values({ userId, name, tokenHash })
    .returning({ id: desktopDevices.id });

  revalidatePath("/settings/desktop");
  return { success: true, data: { id: row.id, token } };
}

export async function revokeDesktopDevice(
  formData: FormData,
): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not signed in" };

  const id = formData.get("id");
  if (typeof id !== "string") {
    return { success: false, error: "id required" };
  }

  await db
    .update(desktopDevices)
    .set({ revokedAt: sql`now()` })
    .where(
      and(
        eq(desktopDevices.id, id),
        eq(desktopDevices.userId, userId),
      ),
    );

  revalidatePath("/settings/desktop");
  return { success: true, data: null };
}
