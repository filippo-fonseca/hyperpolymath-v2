#!/usr/bin/env node
/**
 * Daily Claude Code usage sync — runs on your laptop, ships to Hyperpolymath.
 *
 * Usage:
 *   $ node tools/claude-code-sync.mjs
 *
 * Configuration via env vars (or ~/.hyperpolymath-sync.json):
 *   HYPERPOLYMATH_URL   base URL of the running web app
 *                       (default: http://localhost:3000)
 *                       Flip to your prod URL when you deploy:
 *                       HYPERPOLYMATH_URL=https://hyperpolymath.app
 *   CLAUDE_SYNC_TOKEN   shared secret; must match server-side env var
 *   USER_ID             your Hyperpolymath users.id (UUID)
 *   DAYS_BACK           how many days to backfill each run (default: 35)
 *
 * Optional config file (any of the above can also live here):
 *   ~/.hyperpolymath-sync.json
 *   {
 *     "url": "http://localhost:3000",
 *     "token": "...",
 *     "userId": "uuid-here",
 *     "daysBack": 35
 *   }
 *
 * Cron — install as a macOS LaunchAgent so it runs daily even when you're
 * not in iTerm/Warp. From the repo root:
 *
 *   cp tools/com.hyperpolymath.claude-code-sync.plist \
 *      ~/Library/LaunchAgents/
 *   launchctl load ~/Library/LaunchAgents/com.hyperpolymath.claude-code-sync.plist
 *
 * The plist edits the path to this script — edit before loading.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { createPrivateKey, createHash, sign } from 'node:crypto';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const execFileP = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const WEB_ENV_DIR = path.join(REPO_ROOT, 'apps', 'web');

// Tiny dotenv parser — handles KEY=value, comments, blank lines, and
// optional surrounding quotes. No deps; the script must stay zero-install.
function parseDotenv(raw) {
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const k = trimmed.slice(0, eq).trim();
    let v = trimmed.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

async function readEnvFile(p) {
  try {
    const raw = await readFile(p, 'utf8');
    return parseDotenv(raw);
  } catch {
    return {};
  }
}

/**
 * Resolve config from the same env files the web app already uses, so the
 * deployment URL + sync token + user id live in ONE place
 * (apps/web/.env.local) and flip from localhost to prod by changing one line.
 *
 * Precedence (highest first):
 *   1. process.env — explicit override at invoke time
 *   2. apps/web/.env.local — your real config (gitignored)
 *   3. apps/web/.env — repo-tracked defaults
 *   4. ~/.hyperpolymath-sync.json — legacy fallback (still honored)
 */
async function loadConfig() {
  const repoEnv = await readEnvFile(path.join(WEB_ENV_DIR, '.env'));
  const repoEnvLocal = await readEnvFile(path.join(WEB_ENV_DIR, '.env.local'));
  let legacy = {};
  try {
    const raw = await readFile(path.join(homedir(), '.hyperpolymath-sync.json'), 'utf8');
    legacy = JSON.parse(raw);
  } catch { /* no legacy file — fine */ }
  const merged = { ...repoEnv, ...repoEnvLocal };
  // URL: explicit override wins; otherwise the canonical NEXT_PUBLIC_SITE_URL
  // already used by app/layout.tsx for OG metadata; otherwise localhost.
  const url =
    process.env.HYPERPOLYMATH_URL ??
    merged.HYPERPOLYMATH_URL ??
    merged.NEXT_PUBLIC_SITE_URL ??
    legacy.url ??
    'http://localhost:3000';
  const token =
    process.env.CLAUDE_SYNC_TOKEN ?? merged.CLAUDE_SYNC_TOKEN ?? legacy.token;
  const userId =
    process.env.HYPERPOLYMATH_USER_ID ??
    merged.HYPERPOLYMATH_USER_ID ??
    process.env.USER_ID ??
    legacy.userId;
  const daysBack = Number(
    process.env.DAYS_BACK ?? merged.CLAUDE_SYNC_DAYS_BACK ?? legacy.daysBack ?? 35,
  );
  return { url, token, userId, daysBack };
}

function ymdNoDash(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function ymdDash(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function runCcusage(since, until) {
  // Prefer global ccusage on PATH; fall back to npx.
  let bin = 'ccusage';
  let args = ['daily', '--json', '--since', ymdNoDash(since), '--until', ymdNoDash(until)];
  try {
    await execFileP('ccusage', ['--version'], { timeout: 2000 });
  } catch {
    bin = 'npx';
    args = ['-y', 'ccusage', ...args];
  }
  const { stdout } = await execFileP(bin, args, {
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
    timeout: 60_000,
  });
  return JSON.parse(stdout);
}

async function runCcusageArgs(extraArgs) {
  // Shared bin/npx fallback + env + timeout logic, mirroring runCcusage.
  let bin = 'ccusage';
  let args = [...extraArgs];
  try {
    await execFileP('ccusage', ['--version'], { timeout: 2000 });
  } catch {
    bin = 'npx';
    args = ['-y', 'ccusage', ...args];
  }
  const { stdout } = await execFileP(bin, args, {
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
    timeout: 60_000,
  });
  return JSON.parse(stdout);
}

async function runCcusageBlocksActive() {
  return runCcusageArgs(['blocks', '--active', '--json']);
}

async function runCcusageWeekly() {
  return runCcusageArgs(['weekly', '--json']);
}

// Map the active ccusage block (shape verified live 260616-g0y):
//   { id, startTime, endTime, costUSD, totalTokens, isActive,
//     tokenCounts: { inputTokens, outputTokens,
//                    cacheReadInputTokens, cacheCreationInputTokens },
//     projection: { totalCost, totalTokens } }
// Tolerates snake_case and camelCase. Returns null when there is no active block.
function mapSession(raw) {
  const blocks = Array.isArray(raw?.blocks) ? raw.blocks : [];
  const block = blocks.find((b) => b?.isActive ?? b?.is_active) ?? null;
  if (!block) return null;
  const startTime = block.startTime ?? block.start_time ?? block.id;
  if (typeof startTime !== 'string') return null;
  const tc = block.tokenCounts ?? block.token_counts ?? {};
  const proj = block.projection ?? {};
  const inputTokens = Number(tc.inputTokens ?? tc.input_tokens ?? 0);
  const outputTokens = Number(tc.outputTokens ?? tc.output_tokens ?? 0);
  const cacheReadTokens = Number(
    tc.cacheReadInputTokens ?? tc.cache_read_input_tokens ?? 0,
  );
  const cacheCreationTokens = Number(
    tc.cacheCreationInputTokens ?? tc.cache_creation_input_tokens ?? 0,
  );
  const totalTokens = Number(
    block.totalTokens ??
      block.total_tokens ??
      inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens,
  );
  const costUsd = Number.isFinite(Number(block.costUSD ?? block.cost_usd))
    ? Number(block.costUSD ?? block.cost_usd)
    : null;
  const projectedCostUsd = Number.isFinite(Number(proj.totalCost ?? proj.total_cost))
    ? Number(proj.totalCost ?? proj.total_cost)
    : null;
  const projectedTotalTokens = Number.isFinite(Number(proj.totalTokens ?? proj.total_tokens))
    ? Number(proj.totalTokens ?? proj.total_tokens)
    : null;
  return {
    bucketKey: startTime,
    costUsd,
    totalTokens,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreationTokens,
    windowStart: startTime,
    windowEnd: block.endTime ?? block.end_time ?? null,
    projectedCostUsd,
    projectedTotalTokens,
  };
}

// Map ccusage weekly rows (shape verified live 260616-g0y):
//   weekly: [{ period: "YYYY-MM-DD", totalCost, totalTokens,
//              inputTokens, outputTokens,
//              cacheCreationTokens, cacheReadTokens }, ...]
function mapWeek(row) {
  const weekStart = row.period ?? row.week ?? row.date;
  if (typeof weekStart !== 'string') return null;
  const inputTokens = Number(row.inputTokens ?? row.input_tokens ?? 0);
  const outputTokens = Number(row.outputTokens ?? row.output_tokens ?? 0);
  const cacheReadTokens = Number(row.cacheReadTokens ?? row.cache_read_tokens ?? 0);
  const cacheCreationTokens = Number(
    row.cacheCreationTokens ?? row.cache_creation_tokens ?? 0,
  );
  const totalTokens = Number(
    row.totalTokens ??
      row.total_tokens ??
      inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens,
  );
  const costUsd = Number.isFinite(Number(row.totalCost))
    ? Number(row.totalCost)
    : Number.isFinite(Number(row.total_cost))
    ? Number(row.total_cost)
    : null;
  return {
    weekStart,
    costUsd,
    totalTokens,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreationTokens,
  };
}

function mapRow(row) {
  const date = row.period ?? row.date;
  if (typeof date !== 'string') return null;
  const inputTokens = Number(row.uncached_input_tokens ?? row.inputTokens ?? 0);
  const outputTokens = Number(row.output_tokens ?? row.outputTokens ?? 0);
  const cacheReadTokens = Number(row.cache_read_input_tokens ?? row.cacheReadTokens ?? 0);
  const cacheCreationTokens = Number(
    row.cache_creation?.ephemeral_5m_input_tokens ??
      row.cacheCreationTokens ??
      0,
  ) + Number(row.cache_creation?.ephemeral_1h_input_tokens ?? 0);
  const totalTokens = Number(
    row.totalTokens ??
      row.total_tokens ??
      inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens,
  );
  const costUsd = Number.isFinite(Number(row.totalCost))
    ? Number(row.totalCost)
    : Number.isFinite(Number(row.total_cost))
    ? Number(row.total_cost)
    : null;
  return {
    date,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreationTokens,
    totalTokens,
    costUsd,
  };
}

async function main() {
  const { url, token, userId, daysBack } = await loadConfig();

  if (!token) {
    throw new Error(
      'CLAUDE_SYNC_TOKEN missing — set it in apps/web/.env.local (server reads it from there too)',
    );
  }
  if (!userId) {
    throw new Error(
      'HYPERPOLYMATH_USER_ID missing — set your Hyperpolymath users.id (uuid) in apps/web/.env.local',
    );
  }
  console.log(`[claude-code-sync] target ${url}`);

  const now = new Date();
  const since = new Date(now);
  since.setDate(now.getDate() - daysBack);

  console.log(`[claude-code-sync] running ccusage daily --since ${ymdDash(since)} --until ${ymdDash(now)}`);
  const raw = await runCcusage(since, now);
  const dailyRaw = Array.isArray(raw?.daily) ? raw.daily : [];
  const days = dailyRaw.map(mapRow).filter(Boolean);
  console.log(`[claude-code-sync] mapped ${days.length} day rows`);

  // Subscription snapshots: active 5-hour block + weekly rollups. These are
  // best-effort — a failure here must not block the daily path, which is the
  // load-bearing one. Both ride the SAME signed POST body.
  let session = null;
  let weeks = [];
  try {
    console.log('[claude-code-sync] running ccusage blocks --active --json');
    const blocksRaw = await runCcusageBlocksActive();
    session = mapSession(blocksRaw);
    console.log(`[claude-code-sync] active session: ${session ? session.bucketKey : 'none'}`);
  } catch (e) {
    console.warn(`[claude-code-sync] blocks --active failed (non-fatal): ${e instanceof Error ? e.message : e}`);
  }
  try {
    console.log('[claude-code-sync] running ccusage weekly --json');
    const weeklyRaw = await runCcusageWeekly();
    const weeklyRows = Array.isArray(weeklyRaw?.weekly) ? weeklyRaw.weekly : [];
    weeks = weeklyRows.map(mapWeek).filter(Boolean);
    console.log(`[claude-code-sync] mapped ${weeks.length} week rows`);
  } catch (e) {
    console.warn(`[claude-code-sync] weekly failed (non-fatal): ${e instanceof Error ? e.message : e}`);
  }

  if (days.length === 0 && !session && weeks.length === 0) {
    console.log('[claude-code-sync] nothing to sync');
    return;
  }

  // Sign the request with the Ed25519 private key generated by
  // tools/sync-keygen.mjs. The server verifies with CLAUDE_SYNC_PUBLIC_KEY.
  // The private key never leaves this laptop and is never in any deployed env.
  const privKeyPath = path.join(homedir(), '.hyperpolymath', 'sync-private.pem');
  let privateKey;
  try {
    const pem = await readFile(privKeyPath, 'utf8');
    privateKey = createPrivateKey(pem);
  } catch (e) {
    throw new Error(
      `private key not found at ${privKeyPath} — run \`node tools/sync-keygen.mjs\` first`,
    );
  }
  // session + weeks ride the same signed body; the signature covers the whole
  // body so no signing changes are needed. days is kept exactly as-is.
  const body = JSON.stringify({ user_id: userId, days, session, weeks });
  const timestamp = String(Date.now());
  const bodyHash = createHash('sha256').update(body).digest('hex');
  const signature = sign(null, Buffer.from(`${timestamp}.${bodyHash}`), privateKey).toString('base64');

  const res = await fetch(`${url.replace(/\/$/, '')}/api/integrations/claude-code/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Sync-Timestamp': timestamp,
      'X-Sync-Signature': signature,
    },
    body,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`POST failed: ${res.status} ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  console.log(
    `[claude-code-sync] ok — upserted ${json.upserted ?? '?'} day rows, ` +
      `${json.sessionUpserted ?? 0} session, ${json.weeksUpserted ?? 0} week rows`,
  );
}

main().catch((e) => {
  console.error('[claude-code-sync] FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
