/**
 * Shared plumbing for the two statement-count scripts.
 *
 * The verifier's originals shelled out to `docker exec supabase_db_web psql`.
 * On this machine the Docker CLI is wedged: `docker ps` never returns, and so
 * does `supabase status`, which is what the rest of the verify harness resolves
 * its connection details through. The local Supabase stack itself is perfectly
 * healthy (Postgres answers on 54322 and Kong on 54321), so the fix is to stop
 * going through Docker and talk to the same database over TCP.
 *
 * What this changes: the transport only. The SQL, the pg_stat_statements
 * filter, the reset point and the navigation sequence in the two scripts are
 * unchanged, so the numbers stay comparable with the ones in defect D3.
 *
 * It also writes the Playwright storage state, for the same reason: the
 * harness's `scripts/verify/storage-state.mjs` is correct but reaches its keys
 * through `supabase status`. The sign-in below is that script's logic with the
 * key lookup pointed at `.env.local` instead.
 */
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const WEB_ROOT = join(REPO_ROOT, "apps/web");

// `@supabase/ssr` and `postgres` are apps/web dependencies, and ESM resolves
// bare specifiers from the importing FILE's directory, not the cwd. This file
// lives at the repo root, so resolve them the way apps/web would.
const webRequire = createRequire(join(WEB_ROOT, "package.json"));
const { createServerClient } = await import(
  pathToFileURL(webRequire.resolve("@supabase/ssr")).href
);
const postgres = (await import(pathToFileURL(webRequire.resolve("postgres")).href)).default;

export const VERIFY_DIR = join(REPO_ROOT, ".verify");
export const STORAGE_STATE_PATH = join(VERIFY_DIR, "storage-state.json");
export const CREDENTIALS_PATH = join(VERIFY_DIR, "credentials.json");

/** The Supabase CLI's fixed local Postgres endpoint. Not a credential. */
const LOCAL_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

/** Minimal `.env.local` reader. Values stay in this process; nothing is logged. */
function readEnvLocal() {
  const path = join(WEB_ROOT, ".env.local");
  if (!existsSync(path)) return {};
  /** @type {Record<string, string>} */
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const envLocal = readEnvLocal();

function required(name) {
  const value = process.env[name] ?? envLocal[name];
  if (!value) throw new Error(`${name} is set neither in the environment nor in .env.local`);
  return value;
}

const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
if (!/127\.0\.0\.1|localhost/.test(supabaseUrl)) {
  // Same hard stop the harness has. `pg_stat_statements_reset()` is destructive
  // and this must never be pointed at a real project.
  throw new Error(`refusing to measure against a non-local Supabase URL: ${supabaseUrl}`);
}

const dbUrl = process.env.VERIFY_DATABASE_URL ?? LOCAL_DB_URL;
if (!/127\.0\.0\.1|localhost/.test(dbUrl)) {
  throw new Error("refusing to measure against a non-local database");
}

const client = postgres(dbUrl, { prepare: false, max: 1, onnotice: () => {} });

/**
 * Run one statement and return its single scalar column as trimmed text, which
 * is what `psql -At -c` produced in the originals.
 */
export async function psql(sql) {
  const rows = await client.unsafe(sql);
  return rows
    .map((r) => {
      const v = Object.values(r)[0];
      return v === null || v === undefined ? "" : String(v);
    })
    .join("\n")
    .trim();
}

export async function closeDb() {
  await client.end({ timeout: 5 });
}

/**
 * Only the app's own statements.
 *
 * Verbatim from the verifier's scripts. A raw SUM(calls) over the database is
 * dominated by the Supabase Realtime service's WAL polling, which is background
 * infrastructure and has nothing to do with what a route render costs. Drizzle
 * always emits double-quoted identifiers, so anchoring on `select "` /
 * `insert into "` / ... isolates exactly the statements the app issued.
 */
const BASE_FILTER = `
  dbid = (SELECT oid FROM pg_database WHERE datname='postgres')
  AND query NOT ILIKE '%pg_stat_statements%'
  AND (
    query ~* '^\\s*select\\s+"'
    OR query ~* '^\\s*insert\\s+into\\s+"'
    OR query ~* '^\\s*update\\s+"'
    OR query ~* '^\\s*delete\\s+from\\s+"'
  )
`;

/**
 * ONE clause added to the verifier's filter, and only when asked for.
 *
 * pg_stat_statements is database-global, and this machine routinely has eight
 * or more Next dev servers alive at once, several of them pointed at this same
 * local database. Measured directly: 12 app statements landed in 20 seconds of
 * doing nothing at all, and the noise is not constant, so it does not cancel
 * between a before and an after. Every one of those servers connects as the
 * `postgres` role, so pointing the server under measurement at a role of its
 * own and filtering on `userid` isolates its statements exactly.
 *
 * Set MEASURE_ROLE to the role the measured dev server's DATABASE_URL uses.
 * Leaving it unset reproduces the integration verifier's filter byte for byte.
 *
 * To set one up on the local stack (the `postgres` role is not a superuser
 * there, so the role has to be created as `supabase_admin`):
 *
 *   psql postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres \
 *     -c "CREATE ROLE hp_measure_a LOGIN SUPERUSER PASSWORD 'hp_measure_a'"
 *
 * then boot the server under measurement with
 *
 *   DATABASE_URL=postgresql://hp_measure_a:hp_measure_a@127.0.0.1:54322/postgres \
 *     pnpm exec next dev --turbopack --port 3300
 *
 * and run the scripts with MEASURE_ROLE=hp_measure_a. Superuser is deliberate:
 * the app bypasses RLS as `postgres` does today, so anything less would change
 * what the measured render is allowed to read. Local stack only.
 */
const MEASURE_ROLE = process.env.MEASURE_ROLE;
export const FILTER = MEASURE_ROLE
  ? `${BASE_FILTER} AND userid = (SELECT oid FROM pg_roles WHERE rolname = '${MEASURE_ROLE}')`
  : BASE_FILTER;

/**
 * Sign the harness's test account in and write a storage state the app's
 * `@supabase/ssr` cookie auth accepts. Nothing is hand-written: whatever cookie
 * names, encoding and chunking `createServerClient` emits during sign-in are
 * exactly what the app's own server client reads back.
 */
export async function ensureStorageState() {
  if (!existsSync(CREDENTIALS_PATH)) {
    throw new Error(`no fixture credentials at ${CREDENTIALS_PATH}`);
  }
  const creds = JSON.parse(readFileSync(CREDENTIALS_PATH, "utf8"));
  const anonKey = required("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  /** @type {Map<string, {value: string, options: Record<string, unknown>}>} */
  const jar = new Map();
  const supabase = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll: () => [...jar.entries()].map(([name, e]) => ({ name, value: e.value })),
      setAll: (cookiesToSet) => {
        for (const { name, value, options } of cookiesToSet) {
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
  if (jar.size === 0) throw new Error("@supabase/ssr wrote no cookies during sign-in");

  const cookies = [];
  for (const [name, entry] of jar) {
    for (const domain of ["localhost", "127.0.0.1"]) {
      cookies.push({
        name,
        value: entry.value,
        domain,
        path: typeof entry.options.path === "string" ? entry.options.path : "/",
        expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
        httpOnly: entry.options.httpOnly === true,
        secure: false,
        sameSite: "Lax",
      });
    }
  }

  if (!existsSync(VERIFY_DIR)) mkdirSync(VERIFY_DIR, { recursive: true });
  writeFileSync(STORAGE_STATE_PATH, `${JSON.stringify({ cookies, origins: [] }, null, 2)}\n`, {
    mode: 0o600,
  });
  return STORAGE_STATE_PATH;
}
