/**
 * Lightweight, dependency-free in-memory rate limiter (fixed-window).
 *
 * IMPORTANT — best-effort, per-instance only:
 *   This limiter lives in a single Node process's memory. Vercel runs many
 *   serverless/lambda instances concurrently and recycles them freely, so the
 *   effective global limit is roughly `limit × (number of warm instances)`,
 *   and counters reset whenever an instance is cold-started. This is NOT a hard
 *   global quota. It exists to *dampen* abuse of the public, unauthenticated
 *   landing demo (which spends the owner's paid Anthropic/ElevenLabs keys), so
 *   a single client can't trivially hammer the demo and run up the bill. For a
 *   marketing demo that trade-off is acceptable; if a hard global quota is ever
 *   required, back this with Redis/Upstash instead.
 */

interface WindowEntry {
  count: number;
  /** Epoch ms at which this window expires and the count resets. */
  resetAt: number;
}

const buckets = new Map<string, WindowEntry>();

/** Lazily drop expired entries so the Map can't grow without bound. */
function prune(now: number): void {
  for (const [key, entry] of buckets) {
    if (entry.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitResult {
  ok: boolean;
  /** Seconds the caller should wait before retrying (0 when allowed). */
  retryAfterSec: number;
}

/**
 * Fixed-window check. Returns `ok: false` once `limit` is exceeded within the
 * current `windowMs` window for the given `key`.
 */
export function checkRateLimit(
  key: string,
  opts: { limit: number; windowMs: number },
): RateLimitResult {
  const now = Date.now();
  prune(now);

  const entry = buckets.get(key);
  if (!entry || entry.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
    return { ok: true, retryAfterSec: 0 };
  }

  if (entry.count >= opts.limit) {
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    };
  }

  entry.count += 1;
  return { ok: true, retryAfterSec: 0 };
}
