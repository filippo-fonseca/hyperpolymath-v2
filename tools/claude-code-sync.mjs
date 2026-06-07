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
import { homedir } from 'node:os';
import path from 'node:path';

const execFileP = promisify(execFile);

async function readConfigFile() {
  const p = path.join(homedir(), '.hyperpolymath-sync.json');
  try {
    const raw = await readFile(p, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
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
  const fileConfig = await readConfigFile();
  const url = process.env.HYPERPOLYMATH_URL ?? fileConfig.url ?? 'http://localhost:3000';
  const token = process.env.CLAUDE_SYNC_TOKEN ?? fileConfig.token;
  const userId = process.env.USER_ID ?? fileConfig.userId;
  const daysBack = Number(process.env.DAYS_BACK ?? fileConfig.daysBack ?? 35);

  if (!token) throw new Error('CLAUDE_SYNC_TOKEN missing (env or ~/.hyperpolymath-sync.json)');
  if (!userId) throw new Error('USER_ID missing (env or ~/.hyperpolymath-sync.json)');

  const now = new Date();
  const since = new Date(now);
  since.setDate(now.getDate() - daysBack);

  console.log(`[claude-code-sync] running ccusage daily --since ${ymdDash(since)} --until ${ymdDash(now)}`);
  const raw = await runCcusage(since, now);
  const dailyRaw = Array.isArray(raw?.daily) ? raw.daily : [];
  const days = dailyRaw.map(mapRow).filter(Boolean);
  console.log(`[claude-code-sync] mapped ${days.length} day rows`);

  if (days.length === 0) {
    console.log('[claude-code-sync] nothing to sync');
    return;
  }

  const res = await fetch(`${url.replace(/\/$/, '')}/api/integrations/claude-code/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ user_id: userId, days }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`POST failed: ${res.status} ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  console.log(`[claude-code-sync] ok — upserted ${json.upserted ?? '?'} rows`);
}

main().catch((e) => {
  console.error('[claude-code-sync] FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
