/**
 * Supabase client for mobile Google OAuth.
 *
 * Config (URL + anon key) resolution, most-preferred first:
 *   1. A baked build-time config — EXPO_PUBLIC_SUPABASE_URL /
 *      EXPO_PUBLIC_SUPABASE_ANON_KEY (see apps/mobile/.env.production, inlined
 *      by Metro at EAS build time), with a hardcoded PROD fallback so a release
 *      build ALWAYS has a working client even if the .env file is missing.
 *   2. GET /api/mobile/bootstrap as a *soft override* — lets a mobile build
 *      pointed at a dev/staging server adopt that server's Supabase project.
 *      Production `main` does not serve this route yet, so it must never be a
 *      hard dependency: when it 404s / times out we fall back to the baked
 *      config and Google sign-in still works.
 *
 * Session persists in SecureStore (chunked) so relaunches stay signed in;
 * a restored session that no longer validates triggers a full local sign-out.
 */

import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { makeRedirectUri } from "expo-auth-session";

import { validateBearer } from "./auth-token";
import { getDeviceToken, getSettings, setDeviceToken } from "./settings";

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

/** Default network deadline for auth/bootstrap calls so boot never hangs. */
const AUTH_TIMEOUT_MS = 6000;

/**
 * Baked PROD Supabase URL. Just a public hostname (also the `ref` claim in the
 * anon JWT and in every web request) — safe to hardcode as a fallback so a
 * release build always knows which project to talk to.
 */
const BAKED_SUPABASE_URL = "https://kzdphwebygqaaqcrufow.supabase.co";

/**
 * Build-time-baked config. Metro inlines EXPO_PUBLIC_* references at build time
 * from the env supplied to the build (apps/mobile/.env.production for the URL;
 * the anon key comes from an EAS production env var or a gitignored
 * .env.production.local — see apps/mobile/.env.production for why).
 *
 * The anon key is deliberately NOT hardcoded here: the repo's secret-scanning
 * gate (.gitleaks.toml + husky pre-commit) blocks committing JWTs, and project
 * policy is "secrets in env only". So the URL falls back to the baked constant,
 * but without the anon key in the build env this returns null and we lean on
 * the bootstrap fetch instead.
 */
export function bakedSupabaseConfig(): BootstrapConfig | null {
  const supabaseUrl =
    process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() || BAKED_SUPABASE_URL;
  const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!supabaseUrl || !supabaseAnonKey) return null;
  return { supabaseUrl, supabaseAnonKey };
}

/** Reject a promise after `ms` so a stuck network call can't hang boot. */
function withTimeout<T>(p: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    Promise.resolve(p).then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
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
  // Soft override: prefer the server's own bootstrap (so a dev/staging build
  // adopts that project) but fall back to the baked prod config when the route
  // is absent or slow — production `main` doesn't serve bootstrap yet.
  const fetched = await fetchBootstrap(base, { timeoutMs: AUTH_TIMEOUT_MS });
  const cfg = fetched ?? bakedSupabaseConfig();
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

/**
 * Hydrate + VALIDATE auth from SecureStore. Call once at app start.
 *
 * Guarantees boot never strands the user on a dead session or a spinner:
 *   - A restored Supabase session is validated with getUser() (which refreshes
 *     if the access token expired). A definitive auth failure → full local
 *     sign-out and null. A network/timeout failure keeps the cached session
 *     (offline: let the app open; autoRefresh retries later).
 *   - Otherwise, a legacy device token is validated against a cheap authed
 *     endpoint. A 401 → clear it and sign out; unreachable/timeout keeps it
 *     (offline).
 * Every network call is bounded by AUTH_TIMEOUT_MS, so this always resolves.
 */
export async function initAuth(): Promise<Session | null> {
  if (bootstrapped) return cachedSession;
  bootstrapped = true;

  const sb = await ensureSupabaseClient();
  if (sb) {
    let restored: Session | null = null;
    try {
      const { data } = await withTimeout(sb.auth.getSession(), AUTH_TIMEOUT_MS);
      restored = data.session ?? null;
    } catch {
      restored = null;
    }
    if (restored) {
      const verdict = await validateSupabaseSession(sb);
      if (verdict === "invalid") {
        await clearLocalAuth();
        return null;
      }
      // "ok" or "offline" — trust the restored session.
      cachedSession = restored;
      return cachedSession;
    }
  }

  // No Supabase session. A legacy device token (advanced pairing) may still
  // authenticate us — validate it before trusting it.
  if (getDeviceToken()) {
    const check = await validateBearer({ timeoutMs: AUTH_TIMEOUT_MS });
    if (check === "unauthorized") {
      await clearLocalAuth();
      return null;
    }
    // "ok" or "unreachable" (offline) — keep the token.
  }

  return cachedSession;
}

/**
 * Validate a restored Supabase session. getUser() round-trips to the Auth
 * server and refreshes an expired access token when the refresh token is still
 * good. Returns "invalid" only on a definitive auth rejection so we never sign
 * a user out over a flaky connection.
 */
async function validateSupabaseSession(
  sb: SupabaseClient,
): Promise<"ok" | "invalid" | "offline"> {
  try {
    const { data, error } = await withTimeout(sb.auth.getUser(), AUTH_TIMEOUT_MS);
    if (!error && data.user) return "ok";
    if (!error) return "invalid";
    const status = (error as { status?: number }).status;
    if (status === 401 || status === 403 || status === 400) {
      // Access token rejected — the refresh token may still be good. Try one
      // refresh before signing the user out (getSession usually refreshes for
      // us, but this closes the expired-token race).
      try {
        const { data: r, error: rErr } = await withTimeout(
          sb.auth.refreshSession(),
          AUTH_TIMEOUT_MS,
        );
        return !rErr && r.session ? "ok" : "invalid";
      } catch {
        return "offline"; // couldn't reach the refresh endpoint — stay signed in
      }
    }
    return "offline"; // network / 5xx / unknown — don't punish the user
  } catch {
    return "offline"; // timeout / thrown network error
  }
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

/**
 * User-initiated sign-out. Best-effort revoke the Supabase session on the
 * server, then clear ALL local auth — the Supabase session AND the legacy
 * device token — so the app can never come back half-authed. Listeners fire
 * with null, which drops the shell back to the Login gate.
 */
export async function signOut(): Promise<void> {
  const sb = client ?? (await ensureSupabaseClient());
  if (sb) {
    try {
      await withTimeout(sb.auth.signOut(), AUTH_TIMEOUT_MS);
    } catch {
      // Offline or slow — local teardown below still fully signs us out.
    }
  }
  await clearLocalAuth();
}

/**
 * Local-only teardown: drop the persisted Supabase session and the device
 * token from SecureStore, clear the in-memory session, and notify listeners.
 * No network required — used on boot when a restored session is invalid.
 */
async function clearLocalAuth(): Promise<void> {
  try {
    await client?.auth.signOut({ scope: "local" });
  } catch {
    // ignore — explicit SecureStore delete below is the real teardown
  }
  await secureDelete(SESSION_KEY);
  await setDeviceToken(null);
  cachedSession = null;
  for (const fn of listeners) fn(null);
}
