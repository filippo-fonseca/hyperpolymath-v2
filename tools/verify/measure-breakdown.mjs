/**
 * The same measured navigation as measure-queries.mjs, but printing EVERY
 * statement and its call count rather than the top 15.
 *
 * measure-queries.mjs answers "how many"; this answers "which ones", which is
 * what you need to decide where the next statement can be removed from. It
 * exists alongside rather than inside that script so the canonical number keeps
 * being produced by the verifier's file, unmodified.
 *
 * Usage: node tools/verify/measure-breakdown.mjs <port> <label>
 */
import { chromium } from "@playwright/test";
import { FILTER, closeDb, ensureStorageState, psql } from "./measure-env.mjs";

const PORT = process.argv[2] ?? "3300";
const LABEL = process.argv[3] ?? `port-${PORT}`;
const STATE = await ensureStorageState();

const browser = await chromium.launch();
const ctx = await browser.newContext({
  storageState: STATE,
  viewport: { width: 1440, height: 900 },
});
const page = await ctx.newPage();

await page.goto(`http://localhost:${PORT}/tasks`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(6000);
await page.goto(`http://localhost:${PORT}/lifeos`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(4000);

await psql("SELECT pg_stat_statements_reset();");

await page.goto(`http://localhost:${PORT}/tasks`, { waitUntil: "domcontentloaded" });
await page.waitForLoadState("networkidle").catch(() => {});
await page.waitForTimeout(4000);

const total = await psql(`SELECT COALESCE(SUM(calls),0) FROM pg_stat_statements WHERE ${FILTER};`);
const distinct = await psql(`SELECT COUNT(*) FROM pg_stat_statements WHERE ${FILTER};`);
const all = await psql(`
  SELECT calls || ' x ' || left(regexp_replace(query, '\\s+', ' ', 'g'), 160)
  FROM pg_stat_statements WHERE ${FILTER}
  ORDER BY calls DESC, 1;
`);

console.log(
  JSON.stringify({
    label: LABEL,
    port: PORT,
    totalCalls: Number(total),
    distinctStatements: Number(distinct),
  })
);
console.log("--- every statement ---");
console.log(all);

await browser.close();
await closeDb();
