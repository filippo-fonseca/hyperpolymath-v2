import 'server-only';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { err, ok, type Result } from '@/lib/integrations/result';

const execFileP = promisify(execFile);

/**
 * Claude Code usage data layer (260607-h2k, Task 6).
 *
 * DEVIATION FROM PLAN: ccusage v20 ships as a CLI ONLY — the published package
 * has no `exports` map and no `data-loader` subpath. Verified via Task 0:
 *
 *   $ node -e "import('ccusage/data-loader').catch(e => console.error(e.message))"
 *   Cannot find module '.../node_modules/ccusage/data-loader'
 *
 *   $ cat node_modules/ccusage/package.json | jq .exports
 *   null   // and { bin: { ccusage: "./dist/cli.js" } }
 *
 * Per the plan's Task 0 fallback clause: "If no equivalent exists at all,
 * fall back to consuming the CLI via child_process (last resort; document
 * the deviation in SUMMARY)." We shell out to `ccusage daily --json` and
 * parse the structured output. Pinned at ^20.0.0 so a future major bump
 * that re-exposes a library API can be picked up via a single integration
 * rewrite, not a code-wide refactor.
 *
 * The CLI takes `--since YYYYMMDD --until YYYYMMDD --json` and returns
 * `{ daily: [{ date, inputTokens, outputTokens, ..., totalCost }] }`.
 */

export interface DailyUsage {
  date: string; // YYYY-MM-DD
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  totalTokens: number;
  costUsd: number | null;
}

interface CachedResult {
  at: number;
  data: Result<DailyUsage[]>;
}
let cache: CachedResult | null = null;
const CACHE_TTL_MS = 60 * 1000;

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function toNum(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function mapRow(row: Record<string, unknown>): DailyUsage | null {
  const date = typeof row.date === 'string' ? row.date : null;
  if (!date) return null;
  const inputTokens = toNum(row.inputTokens ?? row.input_tokens);
  const outputTokens = toNum(row.outputTokens ?? row.output_tokens);
  const cacheReadTokens = toNum(row.cacheReadTokens ?? row.cache_read_tokens);
  const cacheCreationTokens = toNum(
    row.cacheCreationTokens ?? row.cache_creation_tokens,
  );
  const totalTokens = toNum(
    row.totalTokens ?? row.total_tokens,
  ) || inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens;
  const costRaw = row.totalCost ?? row.cost ?? row.costUsd ?? row.total_cost;
  const costUsd =
    typeof costRaw === 'number' && Number.isFinite(costRaw) ? costRaw : null;
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

export async function getClaudeCodeUsage(): Promise<Result<DailyUsage[]>> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;

  const now = new Date();
  const since = new Date(now);
  since.setDate(now.getDate() - 30);

  try {
    // `pnpm exec ccusage` would also work but is slower; resolve the bin
    // from node_modules directly via npx, falling back to PATH lookup.
    const args = [
      'ccusage',
      'daily',
      '--json',
      '--since',
      ymd(since),
      '--until',
      ymd(now),
    ];
    const { stdout } = await execFileP('npx', args, {
      // Buffer up to 32 MB — 30 days of usage is well under this in practice.
      maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
      timeout: 20_000,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(stdout);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return err(`ccusage JSON parse failed: ${msg}`);
    }

    // Expected shape: { daily: [...] } per `ccusage daily --json`.
    const dailyRaw =
      (parsed && typeof parsed === 'object' && 'daily' in parsed
        ? (parsed as { daily: unknown }).daily
        : null) ?? null;
    if (!Array.isArray(dailyRaw)) {
      return err('ccusage: unexpected JSON shape — missing `daily` array');
    }

    const data: DailyUsage[] = [];
    for (const row of dailyRaw) {
      if (row && typeof row === 'object') {
        const mapped = mapRow(row as Record<string, unknown>);
        if (mapped) data.push(mapped);
      }
    }
    data.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    const result = ok(data);
    cache = { at: Date.now(), data: result };
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('ENOENT') && msg.toLowerCase().includes('claude')) {
      return err('Claude Code session data not found on this host');
    }
    if (msg.includes('ENOENT')) {
      return err('ccusage CLI not found — install dependencies');
    }
    return err(`ccusage: ${msg}`);
  }
}
