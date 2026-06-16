import 'server-only';
import { and, asc, eq, gte } from 'drizzle-orm';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/lib/db';
import { anthropicApiUsage } from '@/lib/db/schema';
import { err, ok, type Result } from '@/lib/integrations/result';

/**
 * Anthropic API (pay-as-you-go) usage data layer (260616-g0y, DEC-1).
 *
 * Unlike Claude Code (which reads local JSONL via a laptop cron), the Anthropic
 * Cost API is a server-to-server call: apps/web/.env.local holds
 * ANTHROPIC_ADMIN_KEY and the /insights page is already force-dynamic. So this
 * fetches the Cost API live on page load, caches in-process for 60s, and
 * best-effort writes through the fetched days into anthropic_api_usage so the
 * table stays warm (a future cron can take over without a UI rewrite).
 *
 * Failure handling (D-06 Result contract): if the live fetch fails (e.g. the
 * key is a workspace key rather than a real Admin key, which returns 401), fall
 * back to reading the table; if that is empty too, return err(...). Never throw.
 *
 * NOTE on the admin key: the Cost API requires an Admin API key
 * (sk-ant-admin01-...), NOT a workspace key (sk-ant-api03-...). A workspace key
 * returns 401 "invalid x-api-key"; in that case the panel shows an inline error
 * and the owner must mint an Admin key in the Anthropic console.
 */

export interface AnthropicDailyUsage {
  date: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  totalTokens: number;
}

interface CachedResult {
  at: number;
  userId: string;
  data: Result<AnthropicDailyUsage[]>;
}
let cache: CachedResult | null = null;
const CACHE_TTL_MS = 60 * 1000;

const COST_API_URL = 'https://api.anthropic.com/v1/organizations/cost_report';
const ANTHROPIC_VERSION = '2023-06-01';
const WINDOW_DAYS = 30;

function isoDaysAgoMidnightUtc(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function utcDateOf(iso: string): string {
  // Bucket the line item to its UTC calendar date (YYYY-MM-DD).
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// The Cost API returns time-bucketed `data[]`; each bucket carries a window
// (starting_at / ending_at) and a `results[]` array of cost line items. Field
// names vary across line-item shapes, so the schema is permissive and the
// mapping below tolerates both cost-in-`amount` and cost-in-`cost`, and token
// context fields where present. Reconciled against the documented Cost API
// shape; the live key here is a workspace key (401) so the table fallback path
// is what actually serves data until an Admin key is configured.
const lineItemSchema = z
  .object({
    amount: z.union([z.string(), z.number()]).optional(),
    cost: z.union([z.string(), z.number()]).optional(),
    currency: z.string().optional(),
    input_tokens: z.union([z.string(), z.number()]).optional(),
    output_tokens: z.union([z.string(), z.number()]).optional(),
    cache_read_input_tokens: z.union([z.string(), z.number()]).optional(),
    cache_creation_input_tokens: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough();

const bucketSchema = z
  .object({
    starting_at: z.string().optional(),
    ending_at: z.string().optional(),
    results: z.array(lineItemSchema).optional(),
  })
  .passthrough();

const costReportSchema = z
  .object({
    data: z.array(bucketSchema).optional(),
  })
  .passthrough();

function aggregate(
  parsed: z.infer<typeof costReportSchema>,
): AnthropicDailyUsage[] {
  const byDate = new Map<string, AnthropicDailyUsage>();
  for (const bucket of parsed.data ?? []) {
    const date = utcDateOf(bucket.starting_at ?? bucket.ending_at ?? '');
    for (const item of bucket.results ?? []) {
      const costUsd = num(item.amount ?? item.cost);
      const inputTokens = num(item.input_tokens);
      const outputTokens = num(item.output_tokens);
      const cacheReadTokens = num(item.cache_read_input_tokens);
      const cacheCreationTokens = num(item.cache_creation_input_tokens);
      const existing = byDate.get(date) ?? {
        date,
        costUsd: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        totalTokens: 0,
      };
      existing.costUsd += costUsd;
      existing.inputTokens += inputTokens;
      existing.outputTokens += outputTokens;
      existing.cacheReadTokens += cacheReadTokens;
      existing.cacheCreationTokens += cacheCreationTokens;
      existing.totalTokens =
        existing.inputTokens +
        existing.outputTokens +
        existing.cacheReadTokens +
        existing.cacheCreationTokens;
      byDate.set(date, existing);
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

async function readTable(userId: string): Promise<AnthropicDailyUsage[]> {
  const since = isoDaysAgoMidnightUtc(WINDOW_DAYS).slice(0, 10);
  const rows = await db
    .select({
      date: anthropicApiUsage.date,
      inputTokens: anthropicApiUsage.inputTokens,
      outputTokens: anthropicApiUsage.outputTokens,
      cacheReadTokens: anthropicApiUsage.cacheReadTokens,
      cacheCreationTokens: anthropicApiUsage.cacheCreationTokens,
      totalTokens: anthropicApiUsage.totalTokens,
      costUsd: anthropicApiUsage.costUsd,
    })
    .from(anthropicApiUsage)
    .where(
      and(
        eq(anthropicApiUsage.userId, userId),
        gte(anthropicApiUsage.date, since),
      ),
    )
    .orderBy(asc(anthropicApiUsage.date));

  return rows.map((r) => ({
    date: r.date,
    costUsd: r.costUsd != null ? r.costUsd / 1_000_000 : 0,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    cacheReadTokens: r.cacheReadTokens,
    cacheCreationTokens: r.cacheCreationTokens,
    totalTokens: r.totalTokens,
  }));
}

async function writeThrough(
  userId: string,
  days: AnthropicDailyUsage[],
): Promise<void> {
  if (days.length === 0) return;
  // Best-effort: a write failure must never fail the read.
  try {
    await db
      .insert(anthropicApiUsage)
      .values(
        days.map((d) => ({
          userId,
          date: d.date,
          inputTokens: Math.max(0, Math.round(d.inputTokens)),
          outputTokens: Math.max(0, Math.round(d.outputTokens)),
          cacheReadTokens: Math.max(0, Math.round(d.cacheReadTokens)),
          cacheCreationTokens: Math.max(0, Math.round(d.cacheCreationTokens)),
          totalTokens: Math.max(0, Math.round(d.totalTokens)),
          costUsd: Math.round(d.costUsd * 1_000_000),
        })),
      )
      .onConflictDoUpdate({
        target: [anthropicApiUsage.userId, anthropicApiUsage.date],
        set: {
          inputTokens: sql`excluded.input_tokens`,
          outputTokens: sql`excluded.output_tokens`,
          cacheReadTokens: sql`excluded.cache_read_tokens`,
          cacheCreationTokens: sql`excluded.cache_creation_tokens`,
          totalTokens: sql`excluded.total_tokens`,
          costUsd: sql`excluded.cost_usd_micros`,
          syncedAt: new Date(),
        },
      });
  } catch {
    // swallow: write-through is best-effort only.
  }
}

export async function getAnthropicApiUsage(): Promise<Result<AnthropicDailyUsage[]>> {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || !claimsData?.claims) {
    return err('Not signed in');
  }
  const userId = claimsData.claims.sub;

  if (cache && cache.userId === userId && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.data;
  }

  const adminKey = process.env.ANTHROPIC_ADMIN_KEY;

  // No admin key configured: serve whatever the table holds, else error.
  if (!adminKey) {
    try {
      const fallback = await readTable(userId);
      if (fallback.length > 0) {
        const result = ok(fallback);
        cache = { at: Date.now(), userId, data: result };
        return result;
      }
    } catch {
      // fall through to the error below
    }
    return err('ANTHROPIC_ADMIN_KEY not configured');
  }

  try {
    const startingAt = isoDaysAgoMidnightUtc(WINDOW_DAYS);
    const url = `${COST_API_URL}?starting_at=${encodeURIComponent(startingAt)}&bucket_width=1d`;
    const res = await fetch(url, {
      headers: {
        'x-api-key': adminKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Cost API ${res.status}: ${body.slice(0, 200)}`);
    }

    const json: unknown = await res.json();
    const parsed = costReportSchema.parse(json);
    const data = aggregate(parsed);

    await writeThrough(userId, data);

    const result = ok(data);
    cache = { at: Date.now(), userId, data: result };
    return result;
  } catch (fetchError) {
    // Live fetch/parse failed: fall back to the warm table.
    try {
      const fallback = await readTable(userId);
      if (fallback.length > 0) {
        const result = ok(fallback);
        cache = { at: Date.now(), userId, data: result };
        return result;
      }
    } catch {
      // fall through to the error below
    }
    return err(
      `Anthropic API: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`,
    );
  }
}
