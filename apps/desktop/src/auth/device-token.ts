// apps/desktop/src/auth/device-token.ts
// Persisted device token (Authorization: Bearer hpd_...). Minted on the web
// at /settings/desktop and pasted into the app once. Stored in Tauri's
// plugin-store keyring on disk so it survives restarts.

import { LazyStore } from "@tauri-apps/plugin-store";

const STORE_FILE = "auth.json";
const TOKEN_KEY = "device_token";

let cachedToken: string | null | undefined = undefined;
let store: LazyStore | null = null;

function getStore(): LazyStore {
  if (!store) store = new LazyStore(STORE_FILE);
  return store;
}

/** Read the stored device token (memoized after first read). */
export async function getDeviceToken(): Promise<string | null> {
  if (cachedToken !== undefined) return cachedToken;
  try {
    const s = getStore();
    const value = await s.get<string>(TOKEN_KEY);
    cachedToken = typeof value === "string" && value.length > 0 ? value : null;
  } catch {
    cachedToken = null;
  }
  return cachedToken;
}

/** Persist a new device token. Use null to clear. */
export async function setDeviceToken(token: string | null): Promise<void> {
  cachedToken = token && token.length > 0 ? token : null;
  const s = getStore();
  if (cachedToken) {
    await s.set(TOKEN_KEY, cachedToken);
  } else {
    await s.delete(TOKEN_KEY);
  }
  await s.save();
}
