#!/usr/bin/env node
/**
 * One command that takes a cold machine to "a browser can drive this app,
 * signed in, with realistic data on the page".
 *
 *   1. start the local Supabase stack if it is down
 *   2. apply any pending migrations
 *   3. report schema drift between schema.ts, supabase/migrations/ and the live DB
 *   4. seed the local-only test account and fixture data
 *   5. write a Playwright storageState the app's cookie auth accepts
 *   6. boot the dev server on a fixed port
 *   7. prove the storage state actually authenticates, then print the URL
 *
 * IDEMPOTENT. Safe to run twice: a running stack is reused, migrations are
 * guarded, fixtures upsert on deterministic ids, and an already-listening dev
 * server on the target port is adopted rather than duplicated.
 *
 * Usage:
 *   node scripts/verify/bootstrap.mjs            # boot and leave the server running
 *   node scripts/verify/bootstrap.mjs --no-serve # everything except the dev server
 *   VERIFY_PORT=3200 node scripts/verify/bootstrap.mjs
 */
import { spawn, spawnSync } from "node:child_process";
import { openSync } from "node:fs";
import {
  APP_PORT,
  APP_URL,
  DEV_SERVER_LOG,
  STORAGE_STATE_PATH,
  WEB_ROOT,
  ensureVerifyDir,
  isSupabaseRunning,
  log,
  supabase,
} from "./env.mjs";
import { seed } from "./seed.mjs";
import { assertStorageStateWorks, writeStorageState } from "./storage-state.mjs";

const NO_SERVE = process.argv.includes("--no-serve");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function portResponds(port) {
  try {
    // Any HTTP answer means something is listening and speaking HTTP. A
    // redirect to /sign-in still counts here; auth is asserted separately.
    await fetch(`http://localhost:${port}/sign-in`, {
      redirect: "manual",
      signal: AbortSignal.timeout(2000),
    });
    return true;
  } catch {
    return false;
  }
}

async function waitForServer(port, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await portResponds(port)) return true;
    await sleep(1000);
  }
  return false;
}

async function main() {
  ensureVerifyDir();

  // 1. Supabase.
  if (isSupabaseRunning()) {
    log("local Supabase already running");
  } else {
    log("starting local Supabase (this takes a minute on a cold Docker)...");
    supabase(["start"], { inherit: true });
  }

  // 2. Migrations. Guarded and idempotent; a no-op when already current.
  log("applying pending migrations...");
  supabase(["migration", "up", "--local"], { inherit: true });

  // 3. Drift report. Advisory: it prints what the three schema descriptions
  //    disagree about, and only fails the run if the live DB cannot serve
  //    lib/db/schema.ts at all.
  const drift = spawnSync(process.execPath, ["scripts/schema-drift-report.mjs"], {
    cwd: WEB_ROOT,
    encoding: "utf8",
  });
  process.stdout.write(drift.stdout ?? "");
  if (drift.status !== 0) {
    process.stderr.write(drift.stderr ?? "");
    throw new Error("the live database does not satisfy lib/db/schema.ts — see the report above");
  }

  // 4 + 5. Account, fixtures, cookies.
  const { userId, email } = await seed();
  const state = await writeStorageState();

  if (NO_SERVE) {
    log(`done (--no-serve). storageState: ${state.path}`);
    return;
  }

  // 6. Dev server.
  if (await portResponds(APP_PORT)) {
    log(`a server is already listening on ${APP_PORT}; adopting it`);
  } else {
    log(`booting the dev server on ${APP_PORT}...`);
    const out = openSync(DEV_SERVER_LOG, "a");
    const child = spawn(
      "pnpm",
      ["exec", "next", "dev", "--turbopack", "--port", String(APP_PORT)],
      { cwd: WEB_ROOT, detached: true, stdio: ["ignore", out, out] }
    );
    child.unref();
    log(`dev server pid ${child.pid}, log: ${DEV_SERVER_LOG}`);
    if (!(await waitForServer(APP_PORT))) {
      throw new Error(`dev server never came up on ${APP_PORT}; see ${DEV_SERVER_LOG}`);
    }
  }

  // 7. Prove the cookies authenticate against the real running app. This is
  //    the assertion that would have caught a hand-written cookie.
  await assertStorageStateWorks(`${APP_URL}/tasks`);

  log("");
  log(`app:          ${APP_URL}`);
  log(`signed in as: ${email} (${userId})`);
  log(`storageState: ${STORAGE_STATE_PATH}`);
  log(`dev log:      ${DEV_SERVER_LOG}`);
}

await main();
