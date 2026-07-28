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
import { chromium } from "@playwright/test";
import { FILTER, closeDb, ensureStorageState, psql } from "./measure-env.mjs";

const PORT = process.argv[2] ?? "3200";
const LABEL = process.argv[3] ?? `port-${PORT}`;

// Transport only. `psql` and `FILTER` moved into measure-env.mjs because the
// Docker CLI on this machine no longer answers, so `docker exec
// supabase_db_web psql` hangs forever; the same database is reachable over TCP.
// The filter text, the reset point and the navigation below are unchanged, so
// these numbers stay comparable with the integration verifier's.
const STATE = await ensureStorageState();

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

await psql("SELECT pg_stat_statements_reset();");

// The measured navigation: one full /tasks document load.
await page.goto(`http://localhost:${PORT}/tasks`, { waitUntil: "domcontentloaded" });
await page.waitForLoadState("networkidle").catch(() => {});
await page.waitForTimeout(4000);

const total = await psql(`SELECT COALESCE(SUM(calls),0) FROM pg_stat_statements WHERE ${FILTER};`);
const distinct = await psql(`SELECT COUNT(*) FROM pg_stat_statements WHERE ${FILTER};`);
const top = await psql(`
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
await closeDb();
