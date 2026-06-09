/**
 * OKLCH color-blend math (Phase 15 — Training).
 *
 * Why OKLCH: perceptual uniformity. A day blending warm-red (h≈25°) and
 * magenta (h≈350°) should land in the warm-red/rose range, not cyan (180°).
 * Linear hue averaging gets that wrong; circular averaging via atan2 of the
 * unit-vector sum gets it right. L and C average linearly.
 *
 * Used by the training heatmap (each day cell mixes that day's activity-type
 * colors, optionally weighted by duration) and by any other UI that needs to
 * mix N OKLCH colors.
 *
 * Pure functions — no React, no DOM. Safe in Server Components and tests.
 */

export type Oklch = { l: number; c: number; h: number };

/**
 * Matches "oklch(65% 0.13 25)", "oklch(65.5% 0.131 25.3)", "oklch(0.65 0.13 25)"
 * (lightness may or may not have a `%`; if `%` present we treat as 0..100, else
 * we treat as already 0..1).
 */
const OKLCH_RE = /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)\s*\)$/i;

export function parseOklch(s: string): Oklch {
  const m = OKLCH_RE.exec(s.trim());
  if (!m) throw new Error(`Invalid OKLCH: ${s}`);
  const rawL = parseFloat(m[1]!);
  const isPct = m[2] === "%";
  return {
    l: isPct ? rawL / 100 : rawL,
    c: parseFloat(m[3]!),
    h: parseFloat(m[4]!),
  };
}

export function formatOklch(o: Oklch): string {
  return `oklch(${(o.l * 100).toFixed(1)}% ${o.c.toFixed(3)} ${o.h.toFixed(1)})`;
}

/**
 * Blend N OKLCH colors. Lightness and chroma are linear averages; hue is
 * averaged on the unit circle via cos/sin → atan2.
 *
 * @param colors - non-empty array of parsed OKLCH colors
 * @param weights - optional per-color weight (e.g. duration_min). Same length
 *   as `colors`. Defaults to equal weights.
 */
export function blendOklch(colors: Oklch[], weights?: number[]): Oklch {
  if (colors.length === 0) throw new Error("blendOklch: no colors");
  if (colors.length === 1) return colors[0]!;

  const w = weights ?? colors.map(() => 1);
  if (w.length !== colors.length) {
    throw new Error("blendOklch: weights length mismatch");
  }
  const totalW = w.reduce((a, b) => a + b, 0);
  if (totalW === 0) {
    // Degenerate; fall back to unweighted average
    return blendOklch(colors);
  }

  let sumL = 0;
  let sumC = 0;
  let sumCos = 0;
  let sumSin = 0;
  for (let i = 0; i < colors.length; i++) {
    const c = colors[i]!;
    const wi = w[i]!;
    sumL += c.l * wi;
    sumC += c.c * wi;
    const rad = (c.h * Math.PI) / 180;
    sumCos += Math.cos(rad) * wi;
    sumSin += Math.sin(rad) * wi;
  }
  const hDeg =
    (Math.atan2(sumSin / totalW, sumCos / totalW) * 180) / Math.PI;
  return {
    l: sumL / totalW,
    c: sumC / totalW,
    h: hDeg < 0 ? hDeg + 360 : hDeg,
  };
}

/** Thin string wrapper: parse → blend → format. */
export function blendOklchStrings(
  colorStrings: string[],
  weights?: number[],
): string {
  return formatOklch(blendOklch(colorStrings.map(parseOklch), weights));
}
