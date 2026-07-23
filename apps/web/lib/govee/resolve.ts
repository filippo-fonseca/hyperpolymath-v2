/**
 * Govee key + device resolution for Jarvis tools.
 *
 * Owned by u5 (jarvis tools). Settings UI / sync stay with u4 — this module
 * only resolves a client + target device for list_lights / control_lights.
 */

import "server-only";
import { eq } from "drizzle-orm";
import { getUserKeyOrNull } from "@/lib/byok/keys";
import { db } from "@/lib/db";
import { userGoveeDevices } from "@/lib/db/schema";
import { GoveeClient } from "./client";
import type { GoveeDeviceRow } from "./resolve-target";

export type {
  GoveeDeviceRow,
  ResolveTargetErr,
  ResolveTargetOk,
  ResolveTargetResult,
} from "./resolve-target";
export { packRgb, resolveTargetDevice } from "./resolve-target";

/** BYOK `govee` first, then owner env `GOVEE_API_KEY`. */
export async function resolveGoveeApiKey(userId: string): Promise<string | null> {
  const userKey = await getUserKeyOrNull(userId, "govee");
  const envKey = process.env.GOVEE_API_KEY?.trim() || null;
  return userKey ?? envKey;
}

export async function resolveGoveeClient(userId: string): Promise<GoveeClient | null> {
  const apiKey = await resolveGoveeApiKey(userId);
  if (!apiKey) return null;
  return new GoveeClient({ apiKey });
}

export async function loadUserGoveeDevices(userId: string): Promise<GoveeDeviceRow[]> {
  const rows = await db
    .select({
      id: userGoveeDevices.id,
      name: userGoveeDevices.name,
      sku: userGoveeDevices.sku,
      deviceId: userGoveeDevices.deviceId,
      isDefault: userGoveeDevices.isDefault,
      capabilitiesCache: userGoveeDevices.capabilitiesCache,
    })
    .from(userGoveeDevices)
    .where(eq(userGoveeDevices.userId, userId));
  return rows;
}
