import 'server-only';
import { and, asc, desc, eq } from 'drizzle-orm';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/lib/db';
import { claudeSubscriptionUsage } from '@/lib/db/schema';
import { err, ok, type Result } from '@/lib/integrations/result';

/**
 * Claude Code subscription usage data layer (260616-g0y, DEC-2 / DEC-3).
 *
 * Backed by the claude_subscription_usage table, written by the same signed
 * ccusage sync pipeline as claude_code_usage (tools/claude-code-sync.mjs runs
 * `ccusage blocks --active --json` + `ccusage weekly --json` and POSTs the
 * snapshots). Holds one current-session row (kind "session", keyed by the
 * active 5-hour block start time) plus recent weekly rows (kind "week").
 *
 * Mirrors usage.ts: 60s in-process cache, Result<T> contract, never throws to
 * the page.
 */

export interface SessionUsage {
  bucketKey: string;
  costUsd: number | null;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  windowStart: string | null;
  windowEnd: string | null;
  projectedCostUsd: number | null;
  projectedTotalTokens: number | null;
}

export interface WeekUsage {
  weekStart: string;
  costUsd: number | null;
  totalTokens: number;
}

export interface SubscriptionUsage {
  session: SessionUsage | null;
  weeks: WeekUsage[];
}

interface CachedResult {
  at: number;
  userId: string;
  data: Result<SubscriptionUsage>;
}
let cache: CachedResult | null = null;
const CACHE_TTL_MS = 60 * 1000;
const RECENT_WEEKS = 8;

function microsToUsd(micros: number | null): number | null {
  return micros != null ? micros / 1_000_000 : null;
}

export async function getClaudeSubscriptionUsage(): Promise<Result<SubscriptionUsage>> {
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
    const sessionRows = await db
      .select({
        bucketKey: claudeSubscriptionUsage.bucketKey,
        costUsd: claudeSubscriptionUsage.costUsd,
        totalTokens: claudeSubscriptionUsage.totalTokens,
        inputTokens: claudeSubscriptionUsage.inputTokens,
        outputTokens: claudeSubscriptionUsage.outputTokens,
        cacheReadTokens: claudeSubscriptionUsage.cacheReadTokens,
        cacheCreationTokens: claudeSubscriptionUsage.cacheCreationTokens,
        windowStart: claudeSubscriptionUsage.windowStart,
        windowEnd: claudeSubscriptionUsage.windowEnd,
        projectedCostUsd: claudeSubscriptionUsage.projectedCostUsd,
        projectedTotalTokens: claudeSubscriptionUsage.projectedTotalTokens,
      })
      .from(claudeSubscriptionUsage)
      .where(
        and(
          eq(claudeSubscriptionUsage.userId, userId),
          eq(claudeSubscriptionUsage.kind, 'session'),
        ),
      )
      .orderBy(desc(claudeSubscriptionUsage.syncedAt))
      .limit(1);

    const weekRows = await db
      .select({
        bucketKey: claudeSubscriptionUsage.bucketKey,
        costUsd: claudeSubscriptionUsage.costUsd,
        totalTokens: claudeSubscriptionUsage.totalTokens,
      })
      .from(claudeSubscriptionUsage)
      .where(
        and(
          eq(claudeSubscriptionUsage.userId, userId),
          eq(claudeSubscriptionUsage.kind, 'week'),
        ),
      )
      .orderBy(asc(claudeSubscriptionUsage.bucketKey));

    const sessionRow = sessionRows[0];
    const session: SessionUsage | null = sessionRow
      ? {
          bucketKey: sessionRow.bucketKey,
          costUsd: microsToUsd(sessionRow.costUsd),
          totalTokens: sessionRow.totalTokens,
          inputTokens: sessionRow.inputTokens,
          outputTokens: sessionRow.outputTokens,
          cacheReadTokens: sessionRow.cacheReadTokens,
          cacheCreationTokens: sessionRow.cacheCreationTokens,
          windowStart: sessionRow.windowStart
            ? sessionRow.windowStart.toISOString()
            : null,
          windowEnd: sessionRow.windowEnd
            ? sessionRow.windowEnd.toISOString()
            : null,
          projectedCostUsd: microsToUsd(sessionRow.projectedCostUsd),
          projectedTotalTokens: sessionRow.projectedTotalTokens ?? null,
        }
      : null;

    const weeks: WeekUsage[] = weekRows
      .slice(-RECENT_WEEKS)
      .map((w) => ({
        weekStart: w.bucketKey,
        costUsd: microsToUsd(w.costUsd),
        totalTokens: w.totalTokens,
      }));

    const result = ok({ session, weeks });
    cache = { at: Date.now(), userId, data: result };
    return result;
  } catch (e) {
    return err(`Claude subscription: ${e instanceof Error ? e.message : String(e)}`);
  }
}
