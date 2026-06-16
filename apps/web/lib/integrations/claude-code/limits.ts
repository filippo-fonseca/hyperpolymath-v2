/**
 * Configurable Max-5x usage limits (260616-g0y, DEC-3).
 *
 * These are APPROXIMATE, USER-CALIBRATED numbers, NOT scraped real plan
 * limits. True Max-5x plan limits are not available offline: the rate-limit
 * headers Claude Code's /usage reads are not persisted in the local JSONL, and
 * there is no local usage/limit cache. So every percentage the subscription
 * panel renders against these constants is explicitly labeled approximate in
 * the UI.
 *
 * To recalibrate: watch your actual /usage indicator in Claude Code around the
 * point where a 5-hour block or the weekly window hits its cap, then set the
 * matching ceiling below. Cost ceilings are the most stable to eyeball; token
 * ceilings are coarser. Tune the field that matches whatever ccusage reliably
 * reports for your plan.
 */
export const MAX_5X_LIMITS = {
  // Approximate cost ceiling per rolling 5-hour block (USD).
  sessionCostUsd: 35,
  // Approximate token ceiling per rolling 5-hour block.
  sessionTokens: 220_000_000,
  // Approximate cost ceiling per weekly window (USD).
  weeklyCostUsd: 400,
  // Approximate token ceiling per weekly window.
  weeklyTokens: 2_500_000_000,
} as const;

/**
 * Clamped 0 to 100 percentage. Returns null when the limit is non-positive (so
 * the panel can choose to hide the bar rather than divide by zero).
 */
export function pct(value: number | null | undefined, limit: number): number | null {
  if (!Number.isFinite(limit) || limit <= 0) return null;
  const v = Number(value);
  if (!Number.isFinite(v) || v <= 0) return 0;
  return Math.min(100, Math.max(0, (v / limit) * 100));
}
