/**
 * Server URL auto-resolution — no manual field on the login screen.
 *
 * Dev (Expo/Metro): derive the Mac's address from the bundle URL and probe
 * the web app's usual ports. Production builds go straight to the deployed
 * site. A manual override set later in Settings still wins when it responds.
 */

import { NativeModules } from "react-native";

import { DEFAULT_SERVER_URL, getSettings, updateSettings } from "./settings";
import { fetchBootstrap } from "./supabase";

const DEV_WEB_PORTS = [3000, 3100];
const REACH_TIMEOUT_MS = 4000;

function metroHost(): string | null {
  const scriptURL: string | undefined = NativeModules?.SourceCode?.scriptURL;
  if (!scriptURL) return null;
  try {
    return new URL(scriptURL).hostname || null;
  } catch {
    return null;
  }
}

/**
 * Is `base` a reachable Hyperpolymath origin?
 *
 * Bootstrap (/api/mobile/bootstrap) is the ideal signal — it confirms both
 * reachability and that this is a Hyperpolymath server. But production `main`
 * doesn't serve that route yet, and sign-in no longer depends on it (the client
 * has a baked Supabase config), so a plain HTTP response from the origin also
 * counts as reachable. Anything short of a 5xx means the site is up.
 */
async function isReachable(base: string, timeoutMs: number): Promise<boolean> {
  if (await fetchBootstrap(base, { timeoutMs })) return true;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(base, { method: "HEAD", signal: controller.signal });
    return res.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Probe candidates in order; first reachable origin wins. */
export async function resolveServerUrl(): Promise<string | null> {
  const stored = getSettings().serverUrl?.trim().replace(/\/$/, "") || null;
  const candidates: string[] = [];

  if (__DEV__) {
    const host = metroHost();
    if (host) {
      for (const port of DEV_WEB_PORTS) candidates.push(`http://${host}:${port}`);
    }
    for (const port of DEV_WEB_PORTS) candidates.push(`http://localhost:${port}`);
  }
  // A deliberate override from Settings (anything that isn't the shipped
  // default) outranks the dev probes; the default stays last-resort in dev.
  if (stored && stored !== DEFAULT_SERVER_URL) candidates.unshift(stored);
  candidates.push(DEFAULT_SERVER_URL);

  for (const base of [...new Set(candidates)]) {
    if (await isReachable(base, REACH_TIMEOUT_MS)) {
      if (base !== stored) await updateSettings({ serverUrl: base });
      return base;
    }
  }

  // Production fallback: never strand a release user on "no server" because a
  // probe blipped — the baked Supabase config lets Google sign-in proceed
  // against the default origin regardless. Dev returns null (a local server
  // genuinely must be reachable to sign in).
  if (!__DEV__) {
    const fallback = stored || DEFAULT_SERVER_URL;
    if (fallback !== stored) await updateSettings({ serverUrl: fallback });
    return fallback;
  }
  return null;
}
