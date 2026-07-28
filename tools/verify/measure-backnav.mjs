/**
 * Count the Postgres statements a client-side BACK navigation costs.
 *
 * This is the measurement that separates U3's two different claims. Making a
 * single render cheaper and rendering less often are not the same thing, and
 * `experimental.staleTimes` only moves the second one: with the Next default
 * (`dynamic: 0`) the client router cache is never reused, so going back to
 * /tasks re-runs the whole layout on the server. With staleTimes set, the same
 * back navigation should be served from the router cache and cost nothing at
 * the database.
 *
 * Usage: node measure-backnav.mjs <port> <label>
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

// Land on /tasks, then leave it by CLIENT navigation so the router cache holds
// an entry for it.
await page.goto(`http://localhost:${PORT}/tasks`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(6000);
await page.locator('a[href="/lifeos"]').first().click();
await page.waitForURL(/\/lifeos/, { timeout: 30_000 });
await page.waitForTimeout(5000);

// Measure only the return trip, well inside the 30s staleTimes window.
psql("SELECT pg_stat_statements_reset();");

await page.locator('a[href="/tasks"]').first().click();
await page.waitForURL(/\/tasks/, { timeout: 30_000 });
await page.waitForTimeout(4000);

const total = psql(`SELECT COALESCE(SUM(calls),0) FROM pg_stat_statements WHERE ${FILTER};`);
const distinct = psql(`SELECT COUNT(*) FROM pg_stat_statements WHERE ${FILTER};`);

console.log(
  JSON.stringify({
    label: LABEL,
    port: PORT,
    navigation: "client-side return to /tasks within the staleTimes window",
    totalCalls: Number(total),
    distinctStatements: Number(distinct),
  })
);

await browser.close();
