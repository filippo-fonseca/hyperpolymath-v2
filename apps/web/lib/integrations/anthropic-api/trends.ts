import 'server-only';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { err, ok, type Result } from '@/lib/integrations/result';
import { getUserKeyOrNull } from '@/lib/byok/keys';
import { isOwnerUser } from '@/lib/auth/owner';

/**
 * Anthropic API usage TRENDS data layer (issue #133).
 *
 * `usage.ts` already serves daily cost + token totals (input/output/cache),
 * which covers "token consumption" and "usage trends over time" for the panel.
 * What it does NOT carry is REQUEST COUNTS — the Cost API line items are
 * cost-shaped, not request-shaped. This helper fills that gap by calling the
 * Anthropic *Usage Report* API (`/v1/organizations/usage_report/messages`),
 * which buckets by day and reports `*_count` request counters alongside token
 * totals.
 *
 * Contract mirrors usage.ts exactly (D-06 Result, in-process 60s cache, never
 * throws, no owner-env fallback for spending). It is intentionally a SEPARATE
 * file so the #150 BYOK branch can rewrite usage.ts freely without touching
 * this.
 *
 * ── ADMIN KEY / #150 RECONCILIATION ──────────────────────────────────────────
 * Like the Cost API, the Usage Report API requires an Admin API key
 * (sk-ant-admin01-…), not a workspace key. On THIS branch the only available
 * source is the same `ANTHROPIC_ADMIN_KEY` env that usage.ts reads today, so
 * that is what we read here to keep the branch compiling and behaving
 * identically. When #150 lands its per-user encrypted `anthropic_admin` key,
 * swap the `resolveAdminKey()` body below to:
 *
 *   const key = await getUserKeyOrNull(userId, 'anthropic_admin');
 *
 * (importing `getUserKeyOrNull` from '@/lib/byok/keys'). No other change is
 * needed — the rest of this file is already userId-scoped and key-agnostic.
 */

export interface AnthropicDailyRequests {
  /** UTC calendar date, YYYY-MM-DD. */
  date: string;
  /** Number of Messages API requests on this day. */
  requestCount: number;
  /** Input tokens (uncached) for this day, from the usage report. */
  inputTokens: number;
  /** Output tokens for this day, from the usage report. */
  outputTokens: number;
}

interface CachedResult {
  at: number;
  userId: string;
  data: Result<AnthropicDailyRequests[]>;
}
let cache: CachedResult | null = null;
const CACHE_TTL_MS = 60 * 1000;

const USAGE_API_URL =
  'https://api.anthropic.com/v1/organizations/usage_report/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const WINDOW_DAYS = 30;

function isoDaysAgoMidnightUtc(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function utcDateOf(iso: string): string {
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

// The Usage Report returns time-bucketed `data[]`; each bucket carries a window
// (starting_at / ending_at) and a `results[]` array of usage line items. Field
// names vary across line-item shapes, so the schema is permissive: request
// counts have appeared as both `request_count` and `requests`, and token fields
// as `input_tokens` / `uncached_input_tokens` / `output_tokens`. The mapping
// below tolerates each.
const lineItemSchema = z
  .object({
    request_count: z.union([z.string(), z.number()]).optional(),
    requests: z.union([z.string(), z.number()]).optional(),
    input_tokens: z.union([z.string(), z.number()]).optional(),
    uncached_input_tokens: z.union([z.string(), z.number()]).optional(),
    output_tokens: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough();

const bucketSchema = z
  .object({
    starting_at: z.string().optional(),
    ending_at: z.string().optional(),
    results: z.array(lineItemSchema).optional(),
  })
  .passthrough();

const usageReportSchema = z
  .object({
    data: z.array(bucketSchema).optional(),
  })
  .passthrough();

function aggregate(
  parsed: z.infer<typeof usageReportSchema>,
): AnthropicDailyRequests[] {
  const byDate = new Map<string, AnthropicDailyRequests>();
  for (const bucket of parsed.data ?? []) {
    const date = utcDateOf(bucket.starting_at ?? bucket.ending_at ?? '');
    for (const item of bucket.results ?? []) {
      const requestCount = num(item.request_count ?? item.requests);
      const inputTokens = num(item.input_tokens ?? item.uncached_input_tokens);
      const outputTokens = num(item.output_tokens);
      const existing = byDate.get(date) ?? {
        date,
        requestCount: 0,
        inputTokens: 0,
        outputTokens: 0,
      };
      existing.requestCount += requestCount;
      existing.inputTokens += inputTokens;
      existing.outputTokens += outputTokens;
      byDate.set(date, existing);
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Resolves the Admin API key used for the org-scoped Usage Report call.
 *
 * Per-user BYOK (issue #150): reads THIS user's own encrypted Anthropic Admin
 * key. There is deliberately no fallback to the owner's ANTHROPIC_ADMIN_KEY env
 * var — a public user must never read usage billed to the owner's account,
 * matching getAnthropicApiUsage()'s security model.
 */
async function resolveAdminKey(userId: string): Promise<string | null> {
  const userKey = await getUserKeyOrNull(userId, 'anthropic_admin');
  if (userKey) return userKey;
  // Owner-only env fallback: the owner sees request counts with no in-app key;
  // a public user must never read usage billed to the owner's account.
  if (await isOwnerUser(userId)) return process.env.ANTHROPIC_ADMIN_KEY ?? null;
  return null;
}

export async function getAnthropicApiRequestTrends(): Promise<
  Result<AnthropicDailyRequests[]>
> {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  if (claimsError || !claimsData?.claims) {
    return err('Not signed in');
  }
  const userId = claimsData.claims.sub;

  if (cache && cache.userId === userId && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.data;
  }

  const adminKey = await resolveAdminKey(userId);
  if (!adminKey) {
    // No request-count source available. Degrade quietly: the panel still
    // renders cost + token trends from usage.ts; request counts simply hide.
    const result = err('No Anthropic admin key configured for request counts');
    cache = { at: Date.now(), userId, data: result };
    return result;
  }

  try {
    const startingAt = isoDaysAgoMidnightUtc(WINDOW_DAYS);
    const url = `${USAGE_API_URL}?starting_at=${encodeURIComponent(startingAt)}&bucket_width=1d`;
    const res = await fetch(url, {
      headers: {
        'x-api-key': adminKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Usage API ${res.status}: ${body.slice(0, 200)}`);
    }

    const json: unknown = await res.json();
    const parsed = usageReportSchema.parse(json);
    const data = aggregate(parsed);

    const result = ok(data);
    cache = { at: Date.now(), userId, data: result };
    return result;
  } catch (fetchError) {
    const result = err(
      `Anthropic usage trends: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`,
    );
    cache = { at: Date.now(), userId, data: result };
    return result;
  }
}
