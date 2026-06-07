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

let globalCcusageProbed = false;
let globalCcusageAvailable = false;
function hasGlobalCcusage(): boolean {
  if (globalCcusageProbed) return globalCcusageAvailable;
  globalCcusageProbed = true;
  try {
    require('node:child_process').execFileSync('ccusage', ['--version'], {
      stdio: 'ignore',
      timeout: 2000,
    });
    globalCcusageAvailable = true;
  } catch {
    globalCcusageAvailable = false;
  }
  return globalCcusageAvailable;
}

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
  // ccusage v20 returns `period` (YYYY-MM-DD); older shapes used `date`.
  const dateRaw = row.period ?? row.date;
  const date = typeof dateRaw === 'string' ? dateRaw : null;
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

/**
 * Anthropic Admin API fetcher — works in deployed environments where the
 * local ~/.claude/projects/ jsonl files don't exist. Set ANTHROPIC_ADMIN_KEY
 * (mint at console.anthropic.com → Settings → Admin keys) to enable.
 *
 * Returns org-level totals per day, not per-project granularity. Cost is
 * not included in this endpoint — would require a second call to
 * /v1/organizations/cost_report; deferred until ccusage parity matters.
 */
async function getViaAdminApi(
  adminKey: string,
  since: Date,
  until: Date,
): Promise<Result<DailyUsage[]>> {
  const url = new URL('https://api.anthropic.com/v1/organizations/usage_report/messages');
  url.searchParams.set('starting_at', since.toISOString());
  url.searchParams.set('ending_at', until.toISOString());
  url.searchParams.set('bucket_width', '1d');
  url.searchParams.set('limit', '31');

  try {
    const res = await fetch(url, {
      headers: {
        'anthropic-version': '2023-06-01',
        'X-Api-Key': adminKey,
      },
      // 1h cache — same TTL as the in-memory cache, but persists across
      // serverless cold starts on Vercel.
      next: { revalidate: 3600 },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return err(`Admin API ${res.status}: ${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as {
      data?: Array<{
        starting_at: string;
        results: Array<{
          uncached_input_tokens?: number;
          output_tokens?: number;
          cache_read_input_tokens?: number;
          cache_creation?: {
            ephemeral_1h_input_tokens?: number;
            ephemeral_5m_input_tokens?: number;
          };
        }>;
      }>;
    };

    const data: DailyUsage[] = [];
    for (const bucket of json.data ?? []) {
      const date = bucket.starting_at.slice(0, 10);
      let inputTokens = 0;
      let outputTokens = 0;
      let cacheReadTokens = 0;
      let cacheCreationTokens = 0;
      for (const r of bucket.results ?? []) {
        inputTokens += toNum(r.uncached_input_tokens);
        outputTokens += toNum(r.output_tokens);
        cacheReadTokens += toNum(r.cache_read_input_tokens);
        cacheCreationTokens +=
          toNum(r.cache_creation?.ephemeral_1h_input_tokens) +
          toNum(r.cache_creation?.ephemeral_5m_input_tokens);
      }
      data.push({
        date,
        inputTokens,
        outputTokens,
        cacheReadTokens,
        cacheCreationTokens,
        totalTokens: inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens,
        costUsd: null,
      });
    }
    data.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return ok(data);
  } catch (e) {
    return err(`Admin API: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export async function getClaudeCodeUsage(): Promise<Result<DailyUsage[]>> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;

  const now = new Date();
  const since = new Date(now);
  since.setDate(now.getDate() - 30);

  // Prefer the Admin API when an admin key is configured — works anywhere
  // (Vercel, prod, anywhere with outbound HTTPS). Falls back to ccusage CLI
  // for local dev, which surfaces richer per-project session data.
  const adminKey = process.env.ANTHROPIC_ADMIN_KEY;
  if (adminKey) {
    const result = await getViaAdminApi(adminKey, since, now);
    cache = { at: Date.now(), data: result };
    return result;
  }

  try {
    // Prefer the globally-installed `ccusage` binary on PATH; fall back to
    // `npx ccusage` if not found. npx has a ~1s bootstrap that we skip when
    // a global install exists (npm i -g ccusage).
    const useNpx = !process.env.CCUSAGE_BIN && !hasGlobalCcusage();
    const bin = process.env.CCUSAGE_BIN ?? (useNpx ? 'npx' : 'ccusage');
    const args = useNpx
      ? ['ccusage', 'daily', '--json', '--since', ymd(since), '--until', ymd(now)]
      : ['daily', '--json', '--since', ymd(since), '--until', ymd(now)];
    const { stdout } = await execFileP(bin, args, {
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
