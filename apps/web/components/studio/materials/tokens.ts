import * as THREE from "three";

/**
 * The Studiolo — design tokens (U-03).
 *
 * VISION §5 palette, verbatim hex. These are the fixed brand colors of the
 * 3D world island; consumers (U-06 boughs, U-09 embers, U-10 lanterns, U-13
 * ring/ribbon, U-14 fireflies) read from here so the whole scene stays on one
 * palette.
 */
export const STUDIOLO = {
  nightwalnut: "#120E0B",
  deepVellum: "#0E1420",
  parchment: "#F2E9D8",
  sepiaInk: "#4A3B2A",
  brass: "#C9A227",
  candleflame: "#E8C46B",
  emberAlarm: "#FF6B4A",
  jarvisCyan: "#5FD0FF",
  fireflyCyan: "#8FE8FF",
  verdigris: "#4FA487",
  moonlace: "#8FA8C7",
} as const;

export type StudioloToken = keyof typeof STUDIOLO;

/**
 * Per-area accent palette.
 *
 * COPIED VERBATIM from `apps/web/components/areas/AreasTree.tsx` (NODE_PALETTE
 * + pickNodeColor). Do NOT "improve" the palette or the hash: 2D/3D color
 * identity ("boughs match the 2D tree colors exactly") is a Phase-1 acceptance
 * criterion. If you edit either copy, edit BOTH in lockstep. This is a copy,
 * never an import — the 2D component must not become a dependency of the 3D
 * bundle (§7.9 code-split acceptance), nor vice versa.
 */
export const NODE_PALETTE = [
  "oklch(72% 0.13 210)", // cyan (brand)
  "oklch(74% 0.14 350)", // pink
  "oklch(72% 0.14 305)", // purple
  "oklch(74% 0.13 175)", // turquoise
  "oklch(76% 0.15 155)", // mint / light green
  "oklch(80% 0.13 70)", // amber / peach
] as const;

/**
 * Deterministic djb2 hash → palette index. Copied VERBATIM from AreasTree.tsx
 * so a given area/project id maps to the identical color in 2D and 3D.
 */
export function pickNodeColor(id: string): string {
  let h = 5381;
  for (let i = 0; i < id.length; i++) h = ((h << 5) + h + id.charCodeAt(i)) | 0;
  return NODE_PALETTE[Math.abs(h) % NODE_PALETTE.length];
}

// ── oklchToThreeColor ──────────────────────────────────────────────────────
//
// three r185's Color.setStyle parses only hex, rgb()/rgba(), hsl()/hsla(), and
// X11 names — an oklch() string is a SILENT no-op (the color keeps its previous
// value). So we convert OKLCH → linear sRGB manually (Björn Ottosson's OKLab
// reference transform) and hand three linear values directly, which is its
// working color space.

const OKLCH_RE = /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?\s*\)$/i;

// Keyed by the raw string. We hand out clones (see below) so callers can mutate
// the returned color (e.g. U-06 scales for HDR) without corrupting the cache.
const oklchCache = new Map<string, THREE.Color>();

/**
 * Convert an `oklch(L% C H)` string to a THREE.Color in linear sRGB space.
 *
 * Returns a fresh clone every call — callers commonly mutate the result for HDR
 * scaling, and handing out the shared cached instance would corrupt the cache.
 *
 * Dev: throws on malformed input (never the silent-stale-color failure three
 * itself has). Prod: returns white as a safe, visible fallback.
 */
export function oklchToThreeColor(oklch: string): THREE.Color {
  const cached = oklchCache.get(oklch);
  if (cached) return cached.clone();

  const m = OKLCH_RE.exec(oklch.trim());
  if (!m) {
    if (process.env.NODE_ENV !== "production") {
      throw new Error(
        `[studiolo] oklchToThreeColor: unparseable OKLCH string "${oklch}". ` +
          `Expected shape "oklch(72% 0.13 210)".`,
      );
    }
    return new THREE.Color(1, 1, 1);
  }

  const L = m[2] === "%" ? Number(m[1]) / 100 : Number(m[1]);
  const C = Number(m[3]);
  const H = Number(m[4]); // degrees

  // OKLCH → OKLab
  const hRad = (H * Math.PI) / 180;
  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);

  // OKLab → LMS' (cube-root domain)
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  // Cube
  const l = l_ * l_ * l_;
  const mm = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  // LMS → linear sRGB
  let r = 4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s;
  let g = -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s;
  let bl = -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s;

  // Gamut safety net — all six palette entries are in-gamut pastels.
  r = Math.min(1, Math.max(0, r));
  g = Math.min(1, Math.max(0, g));
  bl = Math.min(1, Math.max(0, bl));

  // Step output is LINEAR sRGB — exactly three's working color space. Do NOT
  // route through SRGBColorSpace or a hex string (that would apply an sRGB EOTF
  // to already-linear values and darken every hue).
  const color = new THREE.Color().setRGB(r, g, bl, THREE.LinearSRGBColorSpace);
  oklchCache.set(oklch, color);
  return color.clone();
}
