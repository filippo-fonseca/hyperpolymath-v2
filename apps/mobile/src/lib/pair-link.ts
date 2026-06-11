// Pairing deep link: jarvis://pair?token=hpd_...&server=https://...
// (In Expo Go: exp://<host>/--/pair?...). Lets the web settings page offer
// tap-to-pair instead of copy-pasting tokens, and lets tooling drive
// simulators. Returns true when the URL was a pair link and was applied.

import { setDeviceToken, updateSettings } from "./settings";

export async function handlePairUrl(url: string): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const isPair =
    parsed.pathname.endsWith("/pair") ||
    parsed.pathname.includes("/--/pair") ||
    parsed.hostname === "pair";
  if (!isPair) return false;

  const token = parsed.searchParams.get("token");
  const server = parsed.searchParams.get("server");
  if (token?.startsWith("hpd_")) await setDeviceToken(token);
  if (server?.startsWith("http")) {
    await updateSettings({ serverUrl: server.replace(/\/$/, "") });
  }
  return Boolean(token || server);
}
