/**
 * Resolve the local Supabase stack's connection details at runtime.
 *
 * Keys are read from `supabase status -o json` (or the environment) every time,
 * never from a committed file. The local stack's keys are the CLI's fixed demo
 * keys, but they are still credentials and this harness treats them as such:
 * nothing produced here is written into a tracked file.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const REPO_ROOT = resolve(WEB_ROOT, "../..");

/** Everything this harness generates lives here. Gitignored. */
export const VERIFY_DIR = join(REPO_ROOT, ".verify");
export const STORAGE_STATE_PATH = join(VERIFY_DIR, "storage-state.json");
export const CREDENTIALS_PATH = join(VERIFY_DIR, "credentials.json");
export const DEV_SERVER_LOG = join(VERIFY_DIR, "dev-server.log");

/** Fixed port so the Tester lane never has to discover one. */
export const APP_PORT = Number(process.env.VERIFY_PORT ?? 3100);
export const APP_URL = `http://localhost:${APP_PORT}`;

/** The dedicated local-only account this harness signs in as. */
export const TEST_EMAIL = process.env.VERIFY_EMAIL ?? "verify-harness@hyperpolymath.test";

export function ensureVerifyDir() {
  if (!existsSync(VERIFY_DIR)) mkdirSync(VERIFY_DIR, { recursive: true });
  return VERIFY_DIR;
}

export function supabase(args, opts = {}) {
  return execFileSync("supabase", args, {
    cwd: WEB_ROOT,
    encoding: "utf8",
    stdio: opts.inherit ? "inherit" : ["ignore", "pipe", "pipe"],
    maxBuffer: 32 * 1024 * 1024,
  });
}

/**
 * `supabase status -o json` prints a JSON object, but the CLI also emits
 * warnings and upgrade notices on the same stream depending on version, so the
 * object is extracted rather than parsed off the whole buffer.
 */
function parseStatus(raw) {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error(`unparseable supabase status:\n${raw}`);
  return JSON.parse(raw.slice(start, end + 1));
}

export function isSupabaseRunning() {
  try {
    const status = parseStatus(supabase(["status", "-o", "json"]));
    return Boolean(status.API_URL && status.SERVICE_ROLE_KEY);
  } catch {
    return false;
  }
}

/**
 * @returns {{url: string, anonKey: string, serviceRoleKey: string, dbUrl: string}}
 */
export function supabaseEnv() {
  const status = parseStatus(supabase(["status", "-o", "json"]));
  const env = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? status.API_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? status.ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? status.SERVICE_ROLE_KEY,
    dbUrl: process.env.VERIFY_DATABASE_URL ?? status.DB_URL,
  };
  for (const [k, v] of Object.entries(env)) {
    if (!v) throw new Error(`supabase status did not yield ${k}; is the local stack up?`);
  }
  if (!/127\.0\.0\.1|localhost/.test(env.url)) {
    // Hard stop. Every write below is destructive-by-design fixture seeding and
    // the admin API bypasses RLS; pointing it at a real project would be bad.
    throw new Error(
      `refusing to run the verify harness against a non-local Supabase URL: ${env.url}`
    );
  }
  return env;
}

export function log(msg) {
  process.stdout.write(`[verify] ${msg}\n`);
}
