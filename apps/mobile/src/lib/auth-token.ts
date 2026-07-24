/**
 * Auth bearer resolution for API clients.
 *
 * Prefer a live Supabase access token (Google OAuth). Fall back to the
 * legacy `hpd_…` device token so power users / desktop pairing still works.
 */

import { getSupabaseAccessToken } from "./supabase";
import { getDeviceToken, getSettings } from "./settings";

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

/**
 * Validate the current bearer against a cheap authed endpoint so boot can
 * discard a dead device token instead of stranding the user half-authed.
 *
 *   "ok"           — the server accepted the bearer (or reached an authed route)
 *   "unauthorized" — the server rejected it (401): sign out and clear it
 *   "unreachable"  — network error / timeout / route missing: keep it (offline)
 *
 * Mirrors probeConnection()'s route ladder: POST /voice/text 401s on a bad
 * bearer and 400s ("Empty text") on a good one; if that route isn't deployed
 * (404 on prod `main`), fall back to /voice/transcript which also 401s without
 * a valid bearer. Never sign a user out over a transient network blip.
 */
export async function validateBearer(opts?: {
  timeoutMs?: number;
}): Promise<"ok" | "unauthorized" | "unreachable"> {
  const token = getAuthBearer();
  if (!token) return "unauthorized";
  const base = getSettings().serverUrl.replace(/\/$/, "");
  const timeoutMs = opts?.timeoutMs ?? 6000;

  const probe = async (
    path: string,
    contentType: string,
    body?: string,
  ): Promise<number | null> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${base}${path}`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": contentType },
        body,
        signal: controller.signal,
      });
      return res.status;
    } catch {
      return null; // network error / timeout
    } finally {
      clearTimeout(timer);
    }
  };

  const status = await probe("/api/jarvis/voice/text", "application/json", JSON.stringify({ text: "" }));
  if (status === null) return "unreachable";
  if (status === 401) return "unauthorized";
  if (status === 404) {
    const voice = await probe("/api/jarvis/voice/transcript", "audio/wav");
    if (voice === null) return "unreachable";
    if (voice === 401) return "unauthorized";
    return "ok";
  }
  return "ok";
}
