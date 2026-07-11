/**
 * Fractional position keys for the Wiki Explorer's manual ordering (migration
 * 0048). Pure, zero-dependency, and safe to import in both server actions and
 * client components — no DB, no `server-only`.
 *
 * A position key is a non-empty string of base-62 digits interpreted as the
 * fraction `0.d1 d2 d3 …`. Two keys compared lexicographically sort identically
 * to their fraction values, so Postgres `ORDER BY position_key` and a JS string
 * comparator agree without any decoding. To keep that equivalence total, keys
 * NEVER end in the lowest digit ('0'): a trailing '0' would denote the same
 * fraction as the string without it, yet sort before it.
 *
 * `keyBetween` returns a key strictly between its two neighbors (null = the
 * open ends). Repeatedly bisecting the same gap grows keys by ~1 char per few
 * inserts, which is the expected cost of a dependency-free fractional index.
 */

// Base-62 digits in ascending ASCII order (0-9 < A-Z < a-z), so lexicographic
// string comparison equals fraction-value comparison.
const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const BASE = DIGITS.length; // 62

function digitValue(ch: string): number {
  const v = DIGITS.indexOf(ch);
  if (v < 0) throw new Error(`position: invalid base-62 digit "${ch}"`);
  return v;
}

/**
 * Return a base-62 fraction string strictly between `lower` and `upper`.
 * `lower` is the empty string for the open low end (fraction 0); `upper` is
 * `null` for the open high end (fraction 1). Requires `lower < upper` when both
 * are bounded (compared as fractions, i.e. lexicographically). The result never
 * ends in '0' provided the inputs don't.
 */
function midpoint(lower: string, upper: string | null): string {
  if (upper !== null && lower >= upper) {
    throw new Error(`position: lower must be < upper (got "${lower}", "${upper}")`);
  }

  // Descend through any shared prefix so we only ever bisect the first place the
  // two fractions diverge. `lower` is padded with implicit '0's past its end.
  if (upper !== null) {
    let n = 0;
    while (n < upper.length && (n < lower.length ? lower[n] : "0") === upper[n]) {
      n++;
    }
    if (n > 0) {
      return upper.slice(0, n) + midpoint(lower.slice(n), upper.slice(n));
    }
  }

  const digitA = lower === "" ? 0 : digitValue(lower[0]);
  const digitB = upper === null ? BASE : digitValue(upper[0]);

  if (digitB - digitA > 1) {
    // Room for a digit strictly between the two leading digits.
    const mid = Math.round(0.5 * (digitA + digitB));
    return DIGITS[mid];
  }

  // Leading digits are consecutive (no digit fits between them).
  if (upper !== null && upper.length > 1) {
    // upper = <digitB><tail>, tail non-empty, so <digitB> alone is < upper and
    // > lower (digitB = digitA + 1). digitB is never '0' here (digitA >= 0).
    return upper.slice(0, 1);
  }

  // upper is unbounded or a single digit: keep digitA and recurse into lower's
  // remainder against the open high end.
  return DIGITS[digitA] + midpoint(lower.slice(1), null);
}

/**
 * The canonical fractional-index entry point. Returns a key strictly between
 * `a` and `b`, where `a`/`b` are existing neighbor keys or `null` for the ends:
 *
 * - `keyBetween(null, null)` — the first key in an empty list.
 * - `keyBetween(last, null)` — append after `last`.
 * - `keyBetween(null, first)` — prepend before `first`.
 * - `keyBetween(a, b)` — insert between the adjacent keys `a < b`.
 *
 * Throws if `a >= b` (callers must pass true neighbors in order).
 */
export function keyBetween(a: string | null, b: string | null): string {
  if (a !== null && b !== null && a >= b) {
    throw new Error(`keyBetween: a must be < b (got "${a}", "${b}")`);
  }
  return midpoint(a ?? "", b);
}

/**
 * Generate `n` strictly-increasing keys for seeding an unordered set (e.g. the
 * lazy backfill of a folder's siblings by name). Returns `[]` for n <= 0.
 */
export function initialKeysFor(n: number): string[] {
  const keys: string[] = [];
  let prev: string | null = null;
  for (let i = 0; i < n; i++) {
    prev = keyBetween(prev, null);
    keys.push(prev);
  }
  return keys;
}

/** The minimal shape the Explorer sort contract needs from an item. */
export interface ExplorerSortable {
  positionKey?: string | null;
  name: string;
}

/**
 * The binding sort contract: `(position_key NULLS LAST, name)`. Rows with a key
 * order by it; rows without one trail (NULLS LAST) and fall back to a
 * name compare. Wave-2 client sorting MUST use this so the
 * grid/list match Postgres exactly.
 */
export function compareExplorerItems(a: ExplorerSortable, b: ExplorerSortable): number {
  const ak = a.positionKey ?? null;
  const bk = b.positionKey ?? null;
  if (ak !== null && bk !== null) {
    if (ak !== bk) return ak < bk ? -1 : 1;
  } else if (ak !== null) {
    return -1; // a has a key, b is NULL → a first
  } else if (bk !== null) {
    return 1; // b has a key, a is NULL → b first
  }
  // Tie (equal keys, or both NULL): stable fallback on name.
  return a.name.localeCompare(b.name);
}

/**
 * Compose any comparator with pinned-first behavior: pinned items always float
 * above unpinned ones, and the wrapped comparator breaks ties within each
 * group. Mirrors the `comparePages` pinned rule in PagesListClient so callers
 * can layer pinning onto `compareExplorerItems` (or any other order).
 */
export function withPinnedFirst<T extends { pinned: boolean }>(
  compare: (a: T, b: T) => number,
): (a: T, b: T) => number {
  return (a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return compare(a, b);
  };
}
