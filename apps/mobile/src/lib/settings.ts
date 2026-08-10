// Persistent settings backed by expo-secure-store (Keychain). Single-user
// app — a tiny key/value layer with an in-memory cache and change listeners
// is all we need. The device token lives in its own key so it never travels
// with a settings export.

import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "jarvis.deviceToken";
const SETTINGS_KEY = "jarvis.settings";

export const DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb"; // George (warm British male)

// Production deployment (PROD_SITE_URL in GitHub repo vars — same URL CI
// bakes into desktop DMG builds). For local dev, point the settings sheet at
// your Mac's LAN IP (http://192.168.x.x:3000) — localhost won't resolve from
// the phone.
export const DEFAULT_SERVER_URL = "https://hyperpolymath.com";

export interface MobileSettings {
  serverUrl: string;
  ttsEnabled: boolean;
  voiceId: string;
  /** Tasks screen: completed-cluster disclosure (mirrors web localStorage). */
  tasksCompletedOpen: boolean;
}

const DEFAULTS: MobileSettings = {
  serverUrl: DEFAULT_SERVER_URL,
  ttsEnabled: true,
  voiceId: DEFAULT_VOICE_ID,
  tasksCompletedOpen: false,
};

let cached: MobileSettings = { ...DEFAULTS };
let cachedToken: string | null = null;
let loaded = false;

type Listener = (settings: MobileSettings) => void;
const listeners = new Set<Listener>();

export function onSettingsChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export async function loadSettings(): Promise<MobileSettings> {
  if (loaded) return cached;
  try {
    const raw = await SecureStore.getItemAsync(SETTINGS_KEY);
    if (raw) cached = { ...DEFAULTS, ...(JSON.parse(raw) as Partial<MobileSettings>) };
    cachedToken = await SecureStore.getItemAsync(TOKEN_KEY);
  } catch (err) {
    console.warn("[settings] load failed, using defaults", err);
  }
  loaded = true;
  return cached;
}

export function getSettings(): MobileSettings {
  return cached;
}

export async function updateSettings(patch: Partial<MobileSettings>): Promise<MobileSettings> {
  cached = { ...cached, ...patch };
  for (const fn of listeners) fn(cached);
  await SecureStore.setItemAsync(SETTINGS_KEY, JSON.stringify(cached));
  return cached;
}

export function getDeviceToken(): string | null {
  return cachedToken;
}

export async function setDeviceToken(token: string | null): Promise<void> {
  cachedToken = token?.trim() || null;
  if (cachedToken) {
    await SecureStore.setItemAsync(TOKEN_KEY, cachedToken);
  } else {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  }
}
