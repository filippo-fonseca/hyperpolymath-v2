/**
 * Supabase client for mobile Google OAuth.
 *
 * Config (URL + anon key) is discovered from the configured server via
 * GET /api/mobile/bootstrap — same public values the web app already ships.
 * Session persists in SecureStore (chunked) so relaunches stay signed in.
 */

import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { makeRedirectUri } from "expo-auth-session";

import { getSettings } from "./settings";

WebBrowser.maybeCompleteAuthSession();

const SESSION_KEY = "jarvis.supabase.session";
/** iOS Keychain item size is limited; chunk large JWTs. */
const CHUNK = 1800;

type Listener = (session: Session | null) => void;

let client: SupabaseClient | null = null;
let clientServerBase: string | null = null;
let cachedSession: Session | null = null;
let bootstrapped = false;
const listeners = new Set<Listener>();

async function secureSet(key: string, value: string): Promise<void> {
  const chunks = Math.ceil(value.length / CHUNK) || 1;
  await SecureStore.setItemAsync(`${key}.n`, String(chunks));
  for (let i = 0; i < chunks; i++) {
    await SecureStore.setItemAsync(
      `${key}.${i}`,
      value.slice(i * CHUNK, (i + 1) * CHUNK),
    );
  }
}

async function secureGet(key: string): Promise<string | null> {
  const nRaw = await SecureStore.getItemAsync(`${key}.n`);
  if (!nRaw) {
    // legacy single-key
    return SecureStore.getItemAsync(key);
  }
  const n = Number(nRaw);
  if (!Number.isFinite(n) || n < 1) return null;
  let out = "";
  for (let i = 0; i < n; i++) {
    const part = await SecureStore.getItemAsync(`${key}.${i}`);
    if (part == null) return null;
    out += part;
  }
  return out;
}

async function secureDelete(key: string): Promise<void> {
  const nRaw = await SecureStore.getItemAsync(`${key}.n`);
  if (nRaw) {
    const n = Number(nRaw);
    for (let i = 0; i < n; i++) {
      await SecureStore.deleteItemAsync(`${key}.${i}`).catch(() => undefined);
    }
    await SecureStore.deleteItemAsync(`${key}.n`).catch(() => undefined);
  }
  await SecureStore.deleteItemAsync(key).catch(() => undefined);
}

const storage = {
  getItem: (key: string) => secureGet(key),
  setItem: (key: string, value: string) => secureSet(key, value),
  removeItem: (key: string) => secureDelete(key),
};

export interface BootstrapConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

export async function fetchBootstrap(
  serverUrl?: string,
  opts?: { timeoutMs?: number },
): Promise<BootstrapConfig | null> {
  const base = (serverUrl ?? getSettings().serverUrl).replace(/\/$/, "");
  try {
    const controller = new AbortController();
    const timer = opts?.timeoutMs
      ? setTimeout(() => controller.abort(), opts.timeoutMs)
      : null;
    const res = await fetch(`${base}/api/mobile/bootstrap`, {
      signal: controller.signal,
    }).finally(() => {
      if (timer) clearTimeout(timer);
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<BootstrapConfig>;
    if (!data.supabaseUrl || !data.supabaseAnonKey) return null;
    return {
      supabaseUrl: data.supabaseUrl,
      supabaseAnonKey: data.supabaseAnonKey,
    };
  } catch {
    return null;
  }
}

export async function ensureSupabaseClient(
  serverUrl?: string,
): Promise<SupabaseClient | null> {
  const base = (serverUrl ?? getSettings().serverUrl).replace(/\/$/, "");
  if (client && clientServerBase === base) return client;
  const cfg = await fetchBootstrap(base, { timeoutMs: 6000 });
  if (!cfg) return null;
  clientServerBase = base;

  client = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: {
      storage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      storageKey: SESSION_KEY,
    },
  });

  client.auth.onAuthStateChange((_event, session) => {
    cachedSession = session;
    for (const fn of listeners) fn(session);
  });

  return client;
}

/** Hydrate session from SecureStore. Call once at app start. */
export async function initAuth(): Promise<Session | null> {
  if (bootstrapped) return cachedSession;
  bootstrapped = true;
  const sb = await ensureSupabaseClient();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  cachedSession = data.session ?? null;
  return cachedSession;
}

export function getSession(): Session | null {
  return cachedSession;
}

export function getSupabaseAccessToken(): string | null {
  return cachedSession?.access_token ?? null;
}

export function onAuthChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getOAuthRedirectUri(): string {
  // Custom scheme registered in app.json — works in dev builds and TestFlight.
  // Expo Go falls back to the exp:// proxy via makeRedirectUri.
  return makeRedirectUri({
    scheme: "jarvis",
    path: "auth/callback",
  });
}

/**
 * Kick off Google OAuth via the system browser / ASWebAuthenticationSession.
 * Returns the session on success, null on cancel/failure.
 */
export async function signInWithGoogle(
  serverUrl?: string,
): Promise<{ ok: true; session: Session } | { ok: false; error: string }> {
  const sb = await ensureSupabaseClient(serverUrl);
  if (!sb) {
    return {
      ok: false,
      error: "Could not reach server bootstrap — check the server URL.",
    };
  }

  const redirectTo = getOAuthRedirectUri();
  const { data, error } = await sb.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      queryParams: { prompt: "select_account" },
    },
  });
  if (error || !data.url) {
    return { ok: false, error: error?.message ?? "OAuth start failed" };
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== "success" || !result.url) {
    return { ok: false, error: result.type === "cancel" ? "cancelled" : "auth_failed" };
  }

  const session = await exchangeRedirectUrl(sb, result.url);
  if (!session) {
    return { ok: false, error: "Could not establish session from redirect" };
  }
  cachedSession = session;
  for (const fn of listeners) fn(session);
  return { ok: true, session };
}

async function exchangeRedirectUrl(
  sb: SupabaseClient,
  url: string,
): Promise<Session | null> {
  // Supabase may return tokens in the hash (#access_token=…) or as a
  // ?code=… PKCE exchange depending on flow settings.
  try {
    const parsed = new URL(url);
    const hash = parsed.hash.startsWith("#") ? parsed.hash.slice(1) : parsed.hash;
    const hashParams = new URLSearchParams(hash);
    const queryParams = parsed.searchParams;

    const access_token =
      hashParams.get("access_token") ?? queryParams.get("access_token");
    const refresh_token =
      hashParams.get("refresh_token") ?? queryParams.get("refresh_token");
    if (access_token && refresh_token) {
      const { data, error } = await sb.auth.setSession({
        access_token,
        refresh_token,
      });
      if (error || !data.session) return null;
      return data.session;
    }

    const code = queryParams.get("code") ?? hashParams.get("code");
    if (code) {
      const { data, error } = await sb.auth.exchangeCodeForSession(code);
      if (error || !data.session) return null;
      return data.session;
    }
  } catch (err) {
    console.warn("[auth] exchangeRedirectUrl failed", err);
  }
  return null;
}

export async function signOut(): Promise<void> {
  const sb = client ?? (await ensureSupabaseClient());
  if (sb) await sb.auth.signOut();
  cachedSession = null;
  for (const fn of listeners) fn(null);
}
