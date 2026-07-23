/**
 * The clamp primitives every recognizer in this directory needs.
 *
 * These were copy-pasted verbatim into four recognizers (and `clamp01` into two
 * more modules), which is four places to edit and three to forget. They live here
 * so a recognizer imports the shape rather than re-declaring it. Branch-based
 * rather than `Math.min/Math.max` so a NaN input passes through instead of
 * silently becoming a bound.
 */

/** Clamp `v` into `[lo, hi]`. */
export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

/** Clamp `v` into `[0, 1]` — the normalized cursor/stage space. */
export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Clamp `v` into the symmetric range `[-max, +max]`. */
export const clampAbs = (v: number, max: number): number =>
  v < -max ? -max : v > max ? max : v;
