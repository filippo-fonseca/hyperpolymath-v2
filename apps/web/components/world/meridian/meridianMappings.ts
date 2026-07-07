/**
 * meridianMappings.ts — M-02 · The Studiolo · Phase 2 (The Meridian Ring)
 *
 * The tablet state→light grammar and the tint-resolution rules, codified as
 * pure data + pure functions. This is the meridian sibling of `data/mappings.ts`
 * (the `EMBER_VISUALS` / `classifyTask` pattern) — numbers, not prose.
 *
 * ZERO `three` imports (this is a pure layer, mirror of `treeLayout.ts`). Colors
 * are plain hex strings; the render layer (M-06) hands them to `THREE.Color`.
 * Because `materials/tokens.ts` does `import * as THREE`, importing ANYTHING
 * from it would pull `three` into this module's graph — so, exactly like
 * `treeLayout.ts` did with `pickNodeColor`, we keep a byte-identical PRIVATE
 * COPY of the palette + hash here rather than importing it. If you edit the
 * palette or the hash, edit ALL copies (AreasTree.tsx, tokens.ts, treeLayout.ts)
 * in lockstep — 2D/3D color identity is a Phase-1 acceptance criterion.
 *
 * TINT DOCTRINE (VISION §5, restated as law): a tablet's GLASS tint (`colorHex`)
 * is EITHER the parent bough's OKLCH hue (when `linkEventToProject` confidently
 * links it) OR parchment. Google Calendar's saturated per-calendar colors NEVER
 * tint the glass — they'd shatter the palette. A calendar's `backgroundColor`
 * survives ONLY as the small dot in a hover caption (`calendarDotColor`, keyed
 * off `TabletSlot.calendarId`). Wrong tint is worse than no tint.
 */
import type { GcalCalendarMeta } from "@/lib/gcal/calendars";
import type { TabletState } from "./meridianLayout";

// ── Palette (private, three-free) ──────────────────────────────────────────
// The two structural meridian tints. `PARCHMENT` is the neutral glass; the
// sepia/candleflame values live in TABLET_VISUALS below for the state grammar.
export const PARCHMENT_HEX = "#F2E9D8"; // STUDIOLO.parchment — the neutral glass
const SEPIA_INK_HEX = "#4A3B2A"; // STUDIOLO.sepiaInk — the written-journal mix
const CANDLEFLAME_HEX = "#E8C46B"; // STUDIOLO.candleflame — imminent rim warmth

/**
 * Per-area accent palette + djb2 hash → palette index.
 *
 * COPIED VERBATIM from `materials/tokens.ts` (which copied it from
 * `AreasTree.tsx`). Kept private here so this pure module never imports the
 * `three`-laden `tokens.ts`. A given areaId therefore maps to the identical
 * bough hue in 2D and 3D — the tablet wears its class's bough color exactly.
 */
const NODE_PALETTE = [
  "oklch(72% 0.13 210)", // cyan (brand)
  "oklch(74% 0.14 350)", // pink
  "oklch(72% 0.14 305)", // purple
  "oklch(74% 0.13 175)", // turquoise
  "oklch(76% 0.15 155)", // mint / light green
  "oklch(80% 0.13 70)", // amber / peach
] as const;

function pickNodeColor(id: string): string {
  let h = 5381;
  for (let i = 0; i < id.length; i++) h = ((h << 5) + h + id.charCodeAt(i)) | 0;
  return NODE_PALETTE[Math.abs(h) % NODE_PALETTE.length]!;
}

// ── OKLCH → sRGB hex (pure port of tokens.ts oklchToThreeColor) ─────────────
//
// `tokens.ts` converts OKLCH → LINEAR sRGB and hands three the linear values
// directly (its working space). We can't do that here (three-free), and
// `colorHex` is a plain sRGB hex string. So we run the SAME OKLab reference
// transform to linear sRGB, then apply the sRGB OETF (gamma encode) to 8-bit.
// When M-06 does `new THREE.Color(colorHex)`, three applies the sRGB EOTF and
// recovers the identical linear values — so the tablet hue matches the bough
// hue to within 8-bit rounding. (This is the normal hex path; the "do NOT route
// through hex" caveat in tokens.ts is about their ALREADY-linear output only.)

const OKLCH_RE = /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?\s*\)$/i;

function srgbEncode(c: number): number {
  const x = c <= 0 ? 0 : c >= 1 ? 1 : c;
  return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
}

function to255Hex(c: number): string {
  const v = Math.round(srgbEncode(c) * 255);
  const clamped = v < 0 ? 0 : v > 255 ? 255 : v;
  return clamped.toString(16).padStart(2, "0");
}

/**
 * Convert an `oklch(L% C H)` string to an sRGB `#rrggbb` hex string, purely
 * (no `three`). Dev: throws on malformed input (never a silent stale color).
 * Prod: returns white as a safe, visible fallback.
 */
export function oklchToHex(oklch: string): string {
  const m = OKLCH_RE.exec(oklch.trim());
  if (!m) {
    if (process.env.NODE_ENV !== "production") {
      throw new Error(
        `[studiolo] oklchToHex: unparseable OKLCH string "${oklch}". ` +
          `Expected shape "oklch(72% 0.13 210)".`,
      );
    }
    return "#ffffff";
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
  const r = 4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s;
  const bl = -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s;

  return `#${to255Hex(r)}${to255Hex(g)}${to255Hex(bl)}`;
}

// ── Tint resolution (the frozen `colorHex` rule) ────────────────────────────
/**
 * Resolve a tablet's GLASS tint hex from its (already computed) project link.
 *
 * Order (VISION §5): confident area link → the bough's OKLCH hue as sRGB hex;
 * otherwise parchment. The calendar background color is DELIBERATELY absent
 * here — it never tints the glass (see the module doc). `solveMeridianLayout`
 * calls this to fill `TabletSlot.colorHex`.
 */
export function resolveTabletTint(
  link: { areaId: string; projectId: string } | null,
): string {
  if (link !== null) return oklchToHex(pickNodeColor(link.areaId));
  return PARCHMENT_HEX;
}

/**
 * The calendar-source dot color for a hover caption — the ONLY place Google's
 * saturated per-calendar color is allowed to surface. Keyed off the slot's
 * `calendarId`; falls back to Google blue if the calendar row is missing.
 * (Consumed by M-11's caption; never fed to the glass material.)
 */
export function calendarDotColor(
  calendarId: string,
  calendars: GcalCalendarMeta[],
): string {
  const cal = calendars.find((c) => c.id === calendarId);
  return cal?.backgroundColor ?? "#4285F4";
}

// ── The tablet state grammar, single source ────────────────────────────────
// VISION §2/§5, applied. M-06 reads these numbers (it never re-derives them).
//
//   past     — swung behind zenith, mixed toward Sepia Ink, emissive dropped
//              (the journal of the day already written).
//   upcoming — parchment calm; no rim lift, no lean.
//   imminent — T-15: Candleflame rim lift > 1 (blooms) + the 25° deferential
//              lean toward the dais eyeline.
//   current  — the one true glass at zenith (heroGlass swap owns the material;
//              these numbers describe its rim/lean, not the transmission).
export const TABLET_VISUALS = {
  past: {
    sepiaHex: SEPIA_INK_HEX,
    sepiaMix: 0.7, // fraction toward Sepia Ink in the shader chunk (uSepia)
    emissive: 0.3,
    rimIntensity: 0.4,
    leanRad: 0,
  },
  upcoming: {
    sepiaMix: 0,
    emissive: 0.9,
    rimIntensity: 0.6,
    leanRad: 0,
  },
  imminent: {
    sepiaMix: 0,
    emissive: 1.2,
    rimHex: CANDLEFLAME_HEX,
    rimIntensity: 1.6, // > 1 → trips Bloom (candleflame rim lift)
    leanRad: (25 * Math.PI) / 180, // 25° lean-down toward the dais
    leanMs: 900,
  },
  current: {
    sepiaMix: 0,
    emissive: 1.4,
    rimHex: CANDLEFLAME_HEX,
    rimIntensity: 1.4,
    leanRad: 0,
  },
} as const;

/**
 * State id encoding for the `aTabletState` instanced attribute (§2.4 treaty).
 * FROZEN order — must match the `TabletState` union order exactly:
 *   0 = past, 1 = upcoming, 2 = imminent, 3 = current.
 * M-06 packs `x = TABLET_STATE_ID[state]` into the attribute.
 */
export const TABLET_STATE_ID: Record<TabletState, number> = {
  past: 0,
  upcoming: 1,
  imminent: 2,
  current: 3,
} as const;
