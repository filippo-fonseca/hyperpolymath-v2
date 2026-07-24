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

function metroHost(): string | null {
  const scriptURL: string | undefined = NativeModules?.SourceCode?.scriptURL;
  if (!scriptURL) return null;
  try {
    return new URL(scriptURL).hostname || null;
  } catch {
    return null;
  }
}

/** Probe candidates in order; first one whose bootstrap answers wins. */
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
    if (await fetchBootstrap(base, { timeoutMs: 4000 })) {
      if (base !== stored) await updateSettings({ serverUrl: base });
      return base;
    }
  }
  return null;
}
