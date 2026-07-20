import "server-only";

import { getUserKeyOrNull } from "@/lib/byok/keys";
import { GoveeClient } from "./client";

/**
 * Resolve a Govee API key for the user: BYOK `govee` first, then owner env
 * fallback `GOVEE_API_KEY` (Guardian pattern). Never log or return the key to
 * the client.
 */
export async function resolveGoveeApiKey(userId: string): Promise<string | null> {
  const userKey = await getUserKeyOrNull(userId, "govee");
  return userKey ?? process.env.GOVEE_API_KEY ?? null;
}

/** Returns a configured client, or null when no API key is available. */
export async function createGoveeClient(userId: string): Promise<GoveeClient | null> {
  const apiKey = await resolveGoveeApiKey(userId);
  if (!apiKey) return null;
  return new GoveeClient({ apiKey });
}
