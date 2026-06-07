import 'server-only';
import { and, asc, eq, gte } from 'drizzle-orm';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/lib/db';
import { claudeCodeUsage } from '@/lib/db/schema';
import { err, ok, type Result } from '@/lib/integrations/result';

/**
 * Claude Code usage data layer (260607-h2k, sync-cron variant).
 *
 * Backed by the claude_code_usage table. Rows are written by a local cron
 * on the user's laptop — see tools/claude-code-sync.mjs. The script runs
 * `ccusage daily --json`, packages the result, and POSTs to
 * /api/integrations/claude-code/sync, which upserts on (user_id, date).
 *
 * Why a sync cron instead of in-process: ccusage reads
 * ~/.claude/projects/**\/*.jsonl from the local filesystem — those files
 * don't exist on Vercel/prod, so an in-process call would never work on
 * deploy. The cron decouples the read (laptop) from the read-back (server)
 * so the panel keeps working anywhere the deployed app runs.
 */

export interface DailyUsage {
  date: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  totalTokens: number;
  costUsd: number | null;
}

interface CachedResult {
  at: number;
  userId: string;
  data: Result<DailyUsage[]>;
}
let cache: CachedResult | null = null;
const CACHE_TTL_MS = 60 * 1000;

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function getClaudeCodeUsage(): Promise<Result<DailyUsage[]>> {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || !claimsData?.claims) {
    return err('Not signed in');
  }
  const userId = claimsData.claims.sub;

  if (cache && cache.userId === userId && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.data;
  }

  try {
    const since = isoDaysAgo(30);
    const rows = await db
      .select({
        date: claudeCodeUsage.date,
        inputTokens: claudeCodeUsage.inputTokens,
        outputTokens: claudeCodeUsage.outputTokens,
        cacheReadTokens: claudeCodeUsage.cacheReadTokens,
        cacheCreationTokens: claudeCodeUsage.cacheCreationTokens,
        totalTokens: claudeCodeUsage.totalTokens,
        costUsd: claudeCodeUsage.costUsd,
      })
      .from(claudeCodeUsage)
      .where(
        and(
          eq(claudeCodeUsage.userId, userId),
          gte(claudeCodeUsage.date, since),
        ),
      )
      .orderBy(asc(claudeCodeUsage.date));

    const data: DailyUsage[] = rows.map((r) => ({
      date: r.date,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      cacheReadTokens: r.cacheReadTokens,
      cacheCreationTokens: r.cacheCreationTokens,
      totalTokens: r.totalTokens,
      // Stored as integer micros; restore to USD float, null if absent.
      costUsd: r.costUsd != null ? r.costUsd / 1_000_000 : null,
    }));

    const result = ok(data);
    cache = { at: Date.now(), userId, data: result };
    return result;
  } catch (e) {
    return err(`Claude Code: ${e instanceof Error ? e.message : String(e)}`);
  }
}
