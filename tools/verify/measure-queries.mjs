/**
 * Count the Postgres statements one /tasks document load costs.
 *
 * Measured at the database with pg_stat_statements rather than through the
 * `dbLogger` hook in lib/db/client.ts, because that hook only activates when
 * NODE_ENV === "test" and `next dev` forces NODE_ENV=development. Counting at
 * the database needs no app change at all, and it counts what actually
 * executed rather than what Drizzle intended to send.
 *
 * Usage: node measure-queries.mjs <port> <label>
 */
import { execFileSync } from "node:child_process";
import { chromium } from "@playwright/test";

const PORT = process.argv[2] ?? "3200";
const LABEL = process.argv[3] ?? `port-${PORT}`;
const STATE =
  "/Users/filippofonseca/Developer/Projects/hyperpolymath-v2-wt-jul28-integ/.verify/storage-state.json";

const psql = (sql) =>
  execFileSync(
    "docker",
    ["exec", "supabase_db_web", "psql", "-U", "postgres", "-d", "postgres", "-At", "-c", sql],
    { encoding: "utf8" }
  ).trim();

// Only the app's own statements.
//
// A raw SUM(calls) over the database is dominated by the Supabase Realtime
// service's WAL polling (pg_publication_tables, the `wal->>` decoder, and its
// BEGIN/COMMIT pairs), which is background infrastructure and has nothing to do
// with what a route render costs. Drizzle always emits double-quoted
// identifiers, so anchoring on `select "` / `insert into "` / ... isolates
// exactly the statements the app issued.
const FILTER = `
  dbid = (SELECT oid FROM pg_database WHERE datname='postgres')
  AND query NOT ILIKE '%pg_stat_statements%'
  AND (
    query ~* '^\\s*select\\s+"'
    OR query ~* '^\\s*insert\\s+into\\s+"'
    OR query ~* '^\\s*update\\s+"'
    OR query ~* '^\\s*delete\\s+from\\s+"'
  )
`;

const browser = await chromium.launch();
const ctx = await browser.newContext({
  storageState: STATE,
  viewport: { width: 1440, height: 900 },
});
const page = await ctx.newPage();

// Warm: compile the route and fill any per-process caches, so the measured
// load is a steady-state navigation and not a first-compile outlier.
await page.goto(`http://localhost:${PORT}/tasks`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(6000);
await page.goto(`http://localhost:${PORT}/lifeos`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(4000);

psql("SELECT pg_stat_statements_reset();");

// The measured navigation: one full /tasks document load.
await page.goto(`http://localhost:${PORT}/tasks`, { waitUntil: "domcontentloaded" });
await page.waitForLoadState("networkidle").catch(() => {});
await page.waitForTimeout(4000);

const total = psql(`SELECT COALESCE(SUM(calls),0) FROM pg_stat_statements WHERE ${FILTER};`);
const distinct = psql(`SELECT COUNT(*) FROM pg_stat_statements WHERE ${FILTER};`);
const top = psql(`
  SELECT calls || ' x ' || left(regexp_replace(query, '\\s+', ' ', 'g'), 110)
  FROM pg_stat_statements WHERE ${FILTER}
  ORDER BY calls DESC LIMIT 15;
`);

console.log(
  JSON.stringify({
    label: LABEL,
    port: PORT,
    totalCalls: Number(total),
    distinctStatements: Number(distinct),
  })
);
console.log("--- top statements ---");
console.log(top);

await browser.close();
