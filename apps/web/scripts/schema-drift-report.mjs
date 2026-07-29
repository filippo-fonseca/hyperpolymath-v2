#!/usr/bin/env node
/**
 * schema-drift-report.mjs — diagnose drift between the three descriptions of
 * this repo's Postgres schema:
 *
 *   1. `lib/db/schema.ts`          — what the app's Drizzle queries assume exists.
 *   2. `supabase/migrations/*.sql` — what a fresh `supabase start` / `db reset` builds (local dev).
 *   3. the live local database      — what is actually running right now.
 *
 * These three drift (see the project memory "local-supabase-bringup-gotchas"):
 * `drizzle/` feeds prod by hand, `supabase/migrations/` feeds local, and a new
 * migration is supposed to land in both dirs but sometimes lands in only one.
 *
 * Read-only. Prints a report and exits 1 if the LIVE db is missing anything the
 * app code needs, 0 otherwise.
 *
 * Usage: node scripts/schema-drift-report.mjs [--db-url postgres://...]
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "..");

const dbUrlArg = process.argv.indexOf("--db-url");
const DB_URL =
  (dbUrlArg > -1 ? process.argv[dbUrlArg + 1] : undefined) ??
  process.env.VERIFY_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

/** Columns that Drizzle declares but that live in another schema / are virtual. */
const IGNORED_TABLES = new Set();

/**
 * Parse `pgTable("name", { col: type("db_col"), ... })` blocks out of schema.ts.
 * Only the columns object (the second argument) is scanned, so index names from
 * the optional third argument are not mistaken for columns.
 */
function parseDrizzleSchema(src) {
  const tables = new Map();
  const re = /pgTable\(\s*"([a-z0-9_]+)"\s*,\s*\{/g;
  for (const m of src.matchAll(re)) {
    const name = m[1];
    // Walk braces from the opening `{` of the columns object.
    const openIndex = m.index + m[0].length;
    let depth = 1;
    let i = openIndex;
    while (i < src.length && depth > 0) {
      const ch = src[i];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      i++;
    }
    const body = src.slice(openIndex, i - 1);
    const cols = new Set();
    // Each column is `key: someType("db_column"...)`. Take the first string
    // literal that follows the type call on each property.
    const colRe = /(^|[,{]\s*)[A-Za-z0-9_]+\s*:\s*[A-Za-z0-9_]+\(\s*"([a-z0-9_]+)"/g;
    for (const c of body.matchAll(colRe)) cols.add(c[2]);
    tables.set(name, cols);
  }
  return tables;
}

/** Table names created by a directory of .sql migrations (best effort, for reporting). */
function tablesCreatedBy(dir) {
  const found = new Map(); // table -> file that creates it
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const f of files) {
    const sql = readFileSync(join(dir, f), "utf8");
    const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?"?(?:public\.)?"?([a-z0-9_]+)"?/gi;
    for (const m of sql.matchAll(re)) if (!found.has(m[1])) found.set(m[1], f);
  }
  return found;
}

function fmt(set) {
  return [...set].sort().join(", ");
}

const schemaSrc = readFileSync(join(webRoot, "lib/db/schema.ts"), "utf8");
const expected = parseDrizzleSchema(schemaSrc);

const supaCreates = tablesCreatedBy(join(webRoot, "supabase/migrations"));
const drizzleCreates = tablesCreatedBy(join(webRoot, "drizzle"));

const sql = postgres(DB_URL, { prepare: false, max: 1 });
const rows = await sql`
  select table_name, column_name
  from information_schema.columns
  where table_schema = 'public'
`;
await sql.end();

const live = new Map();
for (const r of rows) {
  if (!live.has(r.table_name)) live.set(r.table_name, new Set());
  live.get(r.table_name).add(r.column_name);
}

const missingTables = [];
const missingColumns = [];
for (const [t, cols] of expected) {
  if (IGNORED_TABLES.has(t)) continue;
  if (!live.has(t)) {
    missingTables.push(t);
    continue;
  }
  const liveCols = live.get(t);
  const gap = [...cols].filter((c) => !liveCols.has(c));
  if (gap.length) missingColumns.push([t, gap]);
}

// Tables the app declares that a FRESH local reset would NOT create. This is the
// drift that bites: the live db can be fine because it was patched by hand.
const notInSupabaseMigrations = [...expected.keys()].filter((t) => !supaCreates.has(t));
const notInDrizzleMigrations = [...expected.keys()].filter((t) => !drizzleCreates.has(t));
const onlyInSupabase = [...supaCreates.keys()].filter((t) => !drizzleCreates.has(t));

console.log("=== schema drift report ===");
console.log(`db:                    ${DB_URL.replace(/:[^:@/]*@/, ":***@")}`);
console.log(`schema.ts tables:      ${expected.size}`);
console.log(`live public tables:    ${live.size}`);
console.log(`supabase/migrations:   ${supaCreates.size} tables created`);
console.log(`drizzle/:              ${drizzleCreates.size} tables created`);
console.log("");

console.log("--- A. live db vs schema.ts (app correctness) ---");
console.log(missingTables.length ? `MISSING TABLES: ${fmt(new Set(missingTables))}` : "tables: ok");
if (missingColumns.length) {
  for (const [t, gap] of missingColumns) console.log(`MISSING COLUMNS ${t}: ${gap.join(", ")}`);
} else {
  console.log("columns: ok");
}
console.log("");

console.log("--- B. schema.ts tables never created by supabase/migrations ---");
console.log(
  notInSupabaseMigrations.length
    ? `${fmt(new Set(notInSupabaseMigrations))}`
    : "none (a fresh reset builds every app table)"
);
console.log("");

console.log("--- C. schema.ts tables never created by drizzle/ (prod path) ---");
console.log(notInDrizzleMigrations.length ? `${fmt(new Set(notInDrizzleMigrations))}` : "none");
console.log("");

console.log("--- D. tables only supabase/migrations creates (local-only) ---");
console.log(onlyInSupabase.length ? `${fmt(new Set(onlyInSupabase))}` : "none");

const bad = missingTables.length + missingColumns.length;
console.log("");
console.log(
  bad
    ? `VERDICT: DRIFT — live db cannot serve the app (${bad} gaps)`
    : "VERDICT: live db satisfies schema.ts"
);
process.exit(bad ? 1 : 0);
