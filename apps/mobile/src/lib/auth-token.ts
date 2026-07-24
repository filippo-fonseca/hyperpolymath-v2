/**
 * Auth bearer resolution for API clients.
 *
 * Prefer a live Supabase access token (Google OAuth). Fall back to the
 * legacy `hpd_…` device token so power users / desktop pairing still works.
 */

import { getSupabaseAccessToken } from "./supabase";
import { getDeviceToken } from "./settings";

export function getAuthBearer(): string | null {
  return getSupabaseAccessToken() ?? getDeviceToken();
}

export function authHeaders(): Record<string, string> {
  const token = getAuthBearer();
  return token ? { authorization: `Bearer ${token}` } : {};
}

export function isAuthed(): boolean {
  return getAuthBearer() !== null;
}
