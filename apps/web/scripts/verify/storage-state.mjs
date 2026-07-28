#!/usr/bin/env node
/**
 * Sign the harness's test account in and write a Playwright `storageState`
 * JSON that the app's `@supabase/ssr` cookie auth actually accepts.
 *
 * WHY IT IS DONE THIS WAY
 *
 * The obvious approach is to call signInWithPassword, take the session, and
 * hand-write an `sb-<ref>-auth-token` cookie. That is a guess, and it is the
 * part that silently breaks: @supabase/ssr picks the cookie name from the
 * project URL, base64url-prefixes the value, and CHUNKS it across
 * `<name>.0`, `<name>.1`, ... once it exceeds the per-cookie size limit. A
 * session JWT plus a refresh token comfortably exceeds that limit, so a
 * hand-written single cookie is rejected and the app 307s to /sign-in with no
 * useful error.
 *
 * So nothing is hand-written here. `createServerClient` is handed an in-memory
 * cookie jar, and whatever names, encoding and chunking IT emits during
 * signInWithPassword are exactly what the app's own server client will read
 * back. The harness and the app agree by construction rather than by
 * assumption.
 *
 * The cookies are emitted for both `localhost` and `127.0.0.1` so the Tester
 * can navigate to either host.
 *
 * The local stack's jwt_expiry is 3600s. The refresh token rides along in the
 * same cookie, so the app refreshes on its own, but re-running this script is
 * the cheap fix if a session ever goes stale mid-run.
 *
 * Usage: node scripts/verify/storage-state.mjs
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServerClient } from "@supabase/ssr";
import {
  APP_PORT,
  CREDENTIALS_PATH,
  STORAGE_STATE_PATH,
  ensureVerifyDir,
  log,
  supabaseEnv,
} from "./env.mjs";

const COOKIE_HOSTS = ["localhost", "127.0.0.1"];

function readCredentials() {
  if (!existsSync(CREDENTIALS_PATH)) {
    throw new Error(
      `no fixture credentials at ${CREDENTIALS_PATH}. Run: node scripts/verify/seed.mjs`
    );
  }
  return JSON.parse(readFileSync(CREDENTIALS_PATH, "utf8"));
}

function toPlaywrightSameSite(value) {
  switch (String(value ?? "lax").toLowerCase()) {
    case "strict":
      return "Strict";
    case "none":
      return "None";
    default:
      return "Lax";
  }
}

export async function writeStorageState() {
  const env = supabaseEnv();
  const creds = readCredentials();

  /** @type {Map<string, {value: string, options: Record<string, unknown>}>} */
  const jar = new Map();

  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll: () => [...jar.entries()].map(([name, e]) => ({ name, value: e.value })),
      setAll: (cookiesToSet) => {
        for (const { name, value, options } of cookiesToSet) {
          // An empty value is @supabase/ssr clearing a chunk it no longer needs.
          if (value === "") jar.delete(name);
          else jar.set(name, { value, options: options ?? {} });
        }
      },
    },
  });

  const { data, error } = await supabase.auth.signInWithPassword({
    email: creds.email,
    password: creds.password,
  });
  if (error) throw new Error(`sign-in failed for ${creds.email}: ${error.message}`);
  if (!data.session) throw new Error("sign-in returned no session");

  if (jar.size === 0) {
    throw new Error(
      "@supabase/ssr wrote no cookies during sign-in; the storage state would be empty"
    );
  }

  const expires = data.session.expires_at ?? Math.floor(Date.now() / 1000) + 3600;
  const cookies = [];
  for (const [name, entry] of jar) {
    for (const domain of COOKIE_HOSTS) {
      cookies.push({
        name,
        value: entry.value,
        domain,
        path: typeof entry.options.path === "string" ? entry.options.path : "/",
        // Playwright wants a unix timestamp; -1 means a session cookie. The
        // refresh token outlives the access token, so the cookie is given the
        // longer life rather than the JWT's hour.
        expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
        httpOnly: entry.options.httpOnly === true,
        secure: false, // http://localhost
        sameSite: toPlaywrightSameSite(entry.options.sameSite),
      });
    }
  }

  ensureVerifyDir();
  const state = { cookies, origins: [] };
  writeFileSync(STORAGE_STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });

  const names = [...jar.keys()].sort();
  log(
    `wrote ${STORAGE_STATE_PATH} — ${names.length} cookie(s) ` +
      `[${names.join(", ")}] x ${COOKIE_HOSTS.length} host(s), ` +
      `session for ${creds.email} expires ${new Date(expires * 1000).toISOString()}`
  );
  return { path: STORAGE_STATE_PATH, cookieNames: names, userId: data.session.user.id };
}

/**
 * Prove the storage state is accepted by the running app rather than assuming
 * it. Hits an authenticated route with the cookies attached and fails on a
 * redirect to /sign-in.
 */
export async function assertStorageStateWorks(url = `http://localhost:${APP_PORT}/tasks`) {
  const state = JSON.parse(readFileSync(STORAGE_STATE_PATH, "utf8"));
  const host = new URL(url).hostname;
  const header = state.cookies
    .filter((c) => c.domain === host)
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  const res = await fetch(url, { headers: { cookie: header }, redirect: "manual" });
  const location = res.headers.get("location") ?? "";
  if (res.status >= 300 && res.status < 400 && location.includes("/sign-in")) {
    throw new Error(`${url} redirected to ${location} — the storage state was not accepted`);
  }
  if (res.status !== 200) throw new Error(`${url} returned ${res.status}`);
  log(`storage state accepted: GET ${url} -> 200`);
  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await writeStorageState();
}
