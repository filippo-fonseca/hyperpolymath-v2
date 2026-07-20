"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { userGoveeDevices } from "@/lib/db/schema";
import { GoveeApiError } from "@/lib/govee/client";
import { createGoveeClient, resolveGoveeApiKey } from "@/lib/govee/service";

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export interface GoveeDeviceRow {
  id: string;
  sku: string;
  deviceId: string;
  name: string;
  isDefault: boolean;
}

async function getUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;
  return data.claims.sub;
}

function mapRow(row: {
  id: string;
  sku: string;
  deviceId: string;
  name: string;
  isDefault: boolean;
}): GoveeDeviceRow {
  return {
    id: row.id,
    sku: row.sku,
    deviceId: row.deviceId,
    name: row.name,
    isDefault: row.isDefault,
  };
}

export async function listGoveeDevices(): Promise<ActionResult<GoveeDeviceRow[]>> {
  const userId = await getUserId();
  if (!userId) return { ok: false, error: "Not authenticated." };

  const rows = await db
    .select({
      id: userGoveeDevices.id,
      sku: userGoveeDevices.sku,
      deviceId: userGoveeDevices.deviceId,
      name: userGoveeDevices.name,
      isDefault: userGoveeDevices.isDefault,
    })
    .from(userGoveeDevices)
    .where(eq(userGoveeDevices.userId, userId))
    .orderBy(userGoveeDevices.name);

  return { ok: true, data: rows.map(mapRow) };
}

export async function getGoveeKeyConfigured(): Promise<boolean> {
  const userId = await getUserId();
  if (!userId) return false;
  const key = await resolveGoveeApiKey(userId);
  return key !== null;
}

export async function syncGoveeDevices(): Promise<ActionResult<GoveeDeviceRow[]>> {
  const userId = await getUserId();
  if (!userId) return { ok: false, error: "Not authenticated." };

  const client = await createGoveeClient(userId);
  if (!client) {
    return {
      ok: false,
      error:
        "No Govee API key configured — add one under API keys, or set GOVEE_API_KEY on the server.",
    };
  }

  let remote;
  try {
    remote = await client.listDevices();
  } catch (err) {
    const message =
      err instanceof GoveeApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Could not reach Govee.";
    return { ok: false, error: message };
  }

  const existing = await db
    .select({
      id: userGoveeDevices.id,
      deviceId: userGoveeDevices.deviceId,
      name: userGoveeDevices.name,
      isDefault: userGoveeDevices.isDefault,
    })
    .from(userGoveeDevices)
    .where(eq(userGoveeDevices.userId, userId));

  const byDeviceId = new Map(existing.map((row) => [row.deviceId, row]));

  for (const device of remote) {
    const prev = byDeviceId.get(device.device);
    const discoveryName = device.deviceName?.trim();
    const fallbackName = discoveryName || `${device.sku} light`;

    if (prev) {
      await db
        .update(userGoveeDevices)
        .set({
          sku: device.sku,
          capabilitiesCache: device.capabilities,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(userGoveeDevices.id, prev.id),
            eq(userGoveeDevices.userId, userId),
          ),
        );
    } else {
      await db.insert(userGoveeDevices).values({
        userId,
        sku: device.sku,
        deviceId: device.device,
        name: fallbackName,
        isDefault: false,
        capabilitiesCache: device.capabilities,
      });
    }
  }

  revalidatePath("/settings");
  return listGoveeDevices();
}

export async function renameGoveeDevice(
  deviceRowId: string,
  name: string,
): Promise<ActionResult<GoveeDeviceRow>> {
  const userId = await getUserId();
  if (!userId) return { ok: false, error: "Not authenticated." };

  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Name cannot be empty." };
  if (trimmed.length > 120) {
    return { ok: false, error: "Name must be 120 characters or fewer." };
  }

  const [updated] = await db
    .update(userGoveeDevices)
    .set({ name: trimmed, updatedAt: new Date() })
    .where(
      and(
        eq(userGoveeDevices.id, deviceRowId),
        eq(userGoveeDevices.userId, userId),
      ),
    )
    .returning({
      id: userGoveeDevices.id,
      sku: userGoveeDevices.sku,
      deviceId: userGoveeDevices.deviceId,
      name: userGoveeDevices.name,
      isDefault: userGoveeDevices.isDefault,
    });

  if (!updated) return { ok: false, error: "Device not found." };

  revalidatePath("/settings");
  return { ok: true, data: mapRow(updated) };
}

export async function setDefaultGoveeDevice(
  deviceRowId: string,
): Promise<ActionResult<GoveeDeviceRow[]>> {
  const userId = await getUserId();
  if (!userId) return { ok: false, error: "Not authenticated." };

  const [target] = await db
    .select({ id: userGoveeDevices.id })
    .from(userGoveeDevices)
    .where(
      and(
        eq(userGoveeDevices.id, deviceRowId),
        eq(userGoveeDevices.userId, userId),
      ),
    )
    .limit(1);

  if (!target) return { ok: false, error: "Device not found." };

  await db
    .update(userGoveeDevices)
    .set({ isDefault: false, updatedAt: new Date() })
    .where(eq(userGoveeDevices.userId, userId));

  await db
    .update(userGoveeDevices)
    .set({ isDefault: true, updatedAt: new Date() })
    .where(
      and(
        eq(userGoveeDevices.id, deviceRowId),
        eq(userGoveeDevices.userId, userId),
      ),
    );

  revalidatePath("/settings");
  return listGoveeDevices();
}

export async function removeGoveeDevice(
  deviceRowId: string,
): Promise<ActionResult<GoveeDeviceRow[]>> {
  const userId = await getUserId();
  if (!userId) return { ok: false, error: "Not authenticated." };

  await db
    .delete(userGoveeDevices)
    .where(
      and(
        eq(userGoveeDevices.id, deviceRowId),
        eq(userGoveeDevices.userId, userId),
      ),
    );

  revalidatePath("/settings");
  return listGoveeDevices();
}
